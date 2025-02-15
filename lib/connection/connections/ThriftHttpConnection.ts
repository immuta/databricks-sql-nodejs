/**
  This file is created using node_modules/thrift/lib/nodejs/lib/thrift/http_connection.js as an example

  The code relies on thrift internals, so be careful when upgrading `thrift` library
*/

import { EventEmitter } from 'events';
import { TBinaryProtocol, TBufferedTransport, Thrift, TProtocol, TProtocolConstructor, TTransport } from 'thrift';
import fetch, { RequestInit, HeadersInit, Response, FetchError } from 'node-fetch';
// @ts-expect-error TS7016: Could not find a declaration file for module
import InputBufferUnderrunError from 'thrift/lib/nodejs/lib/thrift/input_buffer_underrun_error';

export class THTTPException extends Thrift.TApplicationException {
  public readonly statusCode: unknown;

  public readonly response: Response;

  constructor(response: Response) {
    super(
      Thrift.TApplicationExceptionType.PROTOCOL_ERROR,
      `Received a response with a bad HTTP status code: ${response.status}`,
    );
    this.statusCode = response.status;
    this.response = response;
  }
}

type TTransportType = typeof TBufferedTransport;

interface ThriftHttpConnectionOptions {
  url: string;
  transport?: TTransportType;
  protocol?: TProtocolConstructor;
}

// This type describes a shape of internals of Thrift client object.
// It is not perfect good enough for our needs
type ThriftClient = {
  // Internal map of callbacks of running requests. Once request is completed (either successfully or not) -
  // callback should be removed from it
  _reqs: Record<number, (error: unknown, response?: unknown) => void>;
} & {
  // For each client's public method Foo there are two private ones: send_Foo and recv_Foo.
  // We have to access recv_Foo ones to properly parse the response
  [key: string]: (input: TProtocol, mtype: Thrift.MessageType, seqId: number) => void;
};

export default class ThriftHttpConnection extends EventEmitter {
  private readonly url: string;

  private config: RequestInit;

  // This field is used by Thrift internally, so name and type are important
  private readonly transport: TTransportType;

  // This field is used by Thrift internally, so name and type are important
  private readonly protocol: TProtocolConstructor;

  // thrift.createClient sets this field internally
  public client?: ThriftClient;

  constructor(options: ThriftHttpConnectionOptions, config: RequestInit = {}) {
    super();
    this.url = options.url;
    this.config = config;
    this.transport = options.transport ?? TBufferedTransport;
    this.protocol = options.protocol ?? TBinaryProtocol;
  }

  public setHeaders(headers: HeadersInit) {
    this.config = {
      ...this.config,
      headers,
    };
  }

  public write(data: Buffer, seqId: number) {
    const requestConfig: RequestInit = {
      ...this.config,
      method: 'POST',
      headers: {
        ...this.config.headers,
        Connection: 'keep-alive',
        'Content-Length': `${data.length}`,
        'Content-Type': 'application/x-thrift',
      },
      body: data,
    };

    fetch(this.url, requestConfig)
      .then((response) => {
        if (response.status !== 200) {
          throw new THTTPException(response);
        }

        return response.buffer();
      })
      .then((buffer) => {
        this.transport.receiver((transportWithData) => this.handleThriftResponse(transportWithData), seqId)(buffer);
      })
      .catch((error) => {
        if (error instanceof FetchError) {
          if (error.type === 'request-timeout') {
            error = new Thrift.TApplicationException(
              Thrift.TApplicationExceptionType.PROTOCOL_ERROR,
              'Request timed out',
            );
          }
        }

        const defaultErrorHandler = (err: unknown) => {
          this.emit('error', err);
        };

        if (this.client) {
          const callback = this.client._reqs[seqId] ?? defaultErrorHandler;
          delete this.client._reqs[seqId];
          callback(error);
        } else {
          defaultErrorHandler(error);
        }
      });
  }

  private handleThriftResponse(transportWithData: TTransport) {
    if (!this.client) {
      throw new Thrift.TApplicationException(Thrift.TApplicationExceptionType.INTERNAL_ERROR, 'Client not available');
    }

    const Protocol = this.protocol;
    const proto = new Protocol(transportWithData);
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const header = proto.readMessageBegin();
        const dummySeqId = header.rseqid * -1;
        const { client } = this;

        client._reqs[dummySeqId] = (err, success) => {
          transportWithData.commitPosition();
          const clientCallback = client._reqs[header.rseqid];
          delete client._reqs[header.rseqid];
          if (clientCallback) {
            process.nextTick(() => {
              clientCallback(err, success);
            });
          }
        };

        if (client[`recv_${header.fname}`]) {
          client[`recv_${header.fname}`](proto, header.mtype, dummySeqId);
        } else {
          delete client._reqs[dummySeqId];
          throw new Thrift.TApplicationException(
            Thrift.TApplicationExceptionType.WRONG_METHOD_NAME,
            'Received a response to an unknown RPC function',
          );
        }
      }
    } catch (error) {
      if (error instanceof InputBufferUnderrunError) {
        transportWithData.rollbackPosition();
      } else {
        throw error;
      }
    }
  }
}
