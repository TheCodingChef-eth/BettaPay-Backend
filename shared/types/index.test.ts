import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaginationMeta, parsePositiveAmount } from './index.js';

test('buildPaginationMeta clamps invalid limits and preserves its exact shape', () => {
  for (const [limit, expected] of [[-10, 1], [0, 1], [2.9, 2]] as const) {
    const result = buildPaginationMeta(1, limit, 5);
    assert.deepEqual(Object.keys(result).sort(), [
      'page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev',
    ].sort());
    assert.equal(result.limit, expected);
  }
});

test('buildPaginationMeta computes boundary metadata for empty, full, and partial pages', () => {
  assert.deepEqual(buildPaginationMeta(1, 10, 0), {
    page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
  });
  assert.deepEqual(buildPaginationMeta(1, 10, 20), {
    page: 1, limit: 10, total: 20, totalPages: 2, hasNext: true, hasPrev: false,
  });
  assert.deepEqual(buildPaginationMeta(2, 10, 20), {
    page: 2, limit: 10, total: 20, totalPages: 2, hasNext: false, hasPrev: true,
  });
  assert.deepEqual(buildPaginationMeta(2, 10, 21), {
    page: 2, limit: 10, total: 21, totalPages: 3, hasNext: true, hasPrev: true,
  });
});

test('buildPaginationMeta clamps negative and non-finite page/total', () => {
  assert.deepEqual(buildPaginationMeta(-3, 10, 20), {
    page: 1, limit: 10, total: 20, totalPages: 2, hasNext: true, hasPrev: false,
  });
  assert.deepEqual(buildPaginationMeta(0, 10, 20), {
    page: 1, limit: 10, total: 20, totalPages: 2, hasNext: true, hasPrev: false,
  });
  assert.deepEqual(buildPaginationMeta(2, 10, -5), {
    page: 2, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: true,
  });
  assert.deepEqual(buildPaginationMeta(NaN, -1, NaN), {
    page: 1, limit: 1, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
  });
  assert.equal(buildPaginationMeta(Infinity, 10, Infinity).page, 1);
});

test('buildPaginationMeta never returns negative totalPages or contradictory flags', () => {
  const values = [-Infinity, -100, -1.5, -1, 0, 0.5, 1, 2, 2.7, 10, 101, NaN, Infinity];
  for (const page of values) {
    for (const limit of values) {
      for (const total of values) {
        const m = buildPaginationMeta(page, limit, total);
        assert.ok(m.page >= 1 && Number.isInteger(m.page), `page ${m.page}`);
        assert.ok(m.limit >= 1 && Number.isInteger(m.limit), `limit ${m.limit}`);
        assert.ok(m.total >= 0 && Number.isInteger(m.total), `total ${m.total}`);
        assert.ok(m.totalPages >= 0 && Number.isInteger(m.totalPages), `totalPages ${m.totalPages}`);
        assert.equal(m.hasPrev, m.page > 1);
        if (m.hasNext) assert.ok(m.page < m.totalPages);
        if (m.total === 0) assert.equal(m.hasNext, false);
      }
    }
  }
});

test('parsePositiveAmount accepts amounts greater than zero', () => {
  for (const value of ['1', '0.01', '1500.50', '0.0000001', '100000000000000000000.1']) {
    assert.equal(parsePositiveAmount(value), value);
  }
});

test('parsePositiveAmount rejects zero, negative and malformed amounts', () => {
  for (const value of ['0', '0.0', '000.000', '-1', '-0.5', '', 'abc', '1e5', ' 1', '.5']) {
    assert.throws(() => parsePositiveAmount(value), TypeError, `rejects ${JSON.stringify(value)}`);
  }
  assert.throws(() => parsePositiveAmount('0'), /greater than zero/);
});
