const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const ArrowResult = require('../../../dist/result/ArrowResult').default;

const sampleThriftSchema = {
  columns: [
    {
      columnName: '1',
      typeDesc: {
        types: [
          {
            primitiveEntry: {
              type: 3,
              typeQualifiers: null,
            },
          },
        ],
      },
      position: 1,
    },
  ],
};

const sampleArrowSchema = Buffer.from([
  255, 255, 255, 255, 208, 0, 0, 0, 16, 0, 0, 0, 0, 0, 10, 0, 14, 0, 6, 0, 13, 0, 8, 0, 10, 0, 0, 0, 0, 0, 4, 0, 16, 0,
  0, 0, 0, 1, 10, 0, 12, 0, 0, 0, 8, 0, 4, 0, 10, 0, 0, 0, 8, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 24, 0, 0, 0,
  0, 0, 18, 0, 24, 0, 20, 0, 0, 0, 19, 0, 12, 0, 0, 0, 8, 0, 4, 0, 18, 0, 0, 0, 20, 0, 0, 0, 80, 0, 0, 0, 88, 0, 0, 0,
  0, 0, 0, 2, 92, 0, 0, 0, 1, 0, 0, 0, 12, 0, 0, 0, 8, 0, 12, 0, 8, 0, 4, 0, 8, 0, 0, 0, 8, 0, 0, 0, 12, 0, 0, 0, 3, 0,
  0, 0, 73, 78, 84, 0, 22, 0, 0, 0, 83, 112, 97, 114, 107, 58, 68, 97, 116, 97, 84, 121, 112, 101, 58, 83, 113, 108, 78,
  97, 109, 101, 0, 0, 0, 0, 0, 0, 8, 0, 12, 0, 8, 0, 7, 0, 8, 0, 0, 0, 0, 0, 0, 1, 32, 0, 0, 0, 1, 0, 0, 0, 49, 0, 0, 0,
  0, 0, 0, 0,
]);

const sampleEmptyArrowBatch = {
  batch: undefined,
  rowCount: 0,
};

const sampleArrowBatch = {
  batch: Buffer.from([
    255, 255, 255, 255, 136, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 12, 0, 22, 0, 14, 0, 21, 0, 16, 0, 4, 0, 12, 0, 0, 0, 16,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 16, 0, 0, 0, 0, 3, 10, 0, 24, 0, 12, 0, 8, 0, 4, 0, 10, 0, 0, 0, 20, 0, 0, 0, 56,
    0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0,
    0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
  ]),
  rowCount: 1,
};

const sampleRowSet1 = {
  startRowOffset: 0,
  arrowBatches: undefined,
};

const sampleRowSet2 = {
  startRowOffset: 0,
  arrowBatches: [],
};

const sampleRowSet3 = {
  startRowOffset: 0,
  arrowBatches: [sampleEmptyArrowBatch],
};

const sampleRowSet4 = {
  startRowOffset: 0,
  arrowBatches: [sampleArrowBatch],
};

const thriftSchemaAllNulls = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/thriftSchemaAllNulls.json')).toString('utf-8'),
);

const arrowSchemaAllNulls = fs.readFileSync(path.join(__dirname, 'fixtures/arrowSchemaAllNulls.arrow'));

const rowSetAllNulls = {
  startRowOffset: 0,
  arrowBatches: [
    {
      batch: fs.readFileSync(path.join(__dirname, 'fixtures/dataAllNulls.arrow')),
      rowCount: 1,
    },
  ],
};

describe('ArrowResult', () => {
  it('should not buffer any data', async () => {
    const context = {};
    const result = new ArrowResult(context, sampleThriftSchema, sampleArrowSchema);
    await result.getValue([sampleRowSet1]);
    expect(await result.hasPendingData()).to.be.false;
  });

  it('should convert data', async () => {
    const context = {};
    const result = new ArrowResult(context, sampleThriftSchema, sampleArrowSchema);
    expect(await result.getValue([sampleRowSet1])).to.be.deep.eq([]);
    expect(await result.getValue([sampleRowSet2])).to.be.deep.eq([]);
    expect(await result.getValue([sampleRowSet3])).to.be.deep.eq([]);
    expect(await result.getValue([sampleRowSet4])).to.be.deep.eq([{ 1: 1 }]);
  });

  it('should return empty array if no data to process', async () => {
    const context = {};
    const result = new ArrowResult(context, sampleThriftSchema, sampleArrowSchema);
    expect(await result.getValue()).to.be.deep.eq([]);
    expect(await result.getValue([])).to.be.deep.eq([]);
  });

  it('should return empty array if no schema available', async () => {
    const context = {};
    const result = new ArrowResult(context);
    expect(await result.getValue([sampleRowSet4])).to.be.deep.eq([]);
  });

  it('should detect nulls', async () => {
    const context = {};
    const result = new ArrowResult(context, thriftSchemaAllNulls, arrowSchemaAllNulls);
    expect(await result.getValue([rowSetAllNulls])).to.be.deep.eq([
      {
        boolean_field: null,

        tinyint_field: null,
        smallint_field: null,
        int_field: null,
        bigint_field: null,

        float_field: null,
        double_field: null,
        decimal_field: null,

        string_field: null,
        char_field: null,
        varchar_field: null,

        timestamp_field: null,
        date_field: null,
        day_interval_field: null,
        month_interval_field: null,

        binary_field: null,

        struct_field: null,
        array_field: null,
      },
    ]);
  });
});
