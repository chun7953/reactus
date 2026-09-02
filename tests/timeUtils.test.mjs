import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDuration } from '../src/lib/timeUtils.js';

test('parseDuration converts supported units to milliseconds', () => {
    assert.equal(parseDuration('10m'), 10 * 60 * 1000);
    assert.equal(parseDuration('1h'), 60 * 60 * 1000);
    assert.equal(parseDuration('2d'), 2 * 24 * 60 * 60 * 1000);
});

test('parseDuration accepts spaces and uppercase units', () => {
    assert.equal(parseDuration('15 M'), 15 * 60 * 1000);
});

test('parseDuration rejects unsupported formats', () => {
    assert.equal(parseDuration('tomorrow'), null);
    assert.equal(parseDuration('30s'), null);
});
