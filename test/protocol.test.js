import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInputList,
  dbToRaw,
  isSafeCommand,
  normalizeInputCode,
  parseLine,
  rawToDb,
  splitLines,
} from '../src/pioneer/protocol.js';

test('parseLine reads the answers measured on a VSX-528', () => {
  assert.deepEqual(parseLine('PWR0'), { type: 'power', on: true });
  assert.deepEqual(parseLine('PWR2'), { type: 'power', on: false });
  assert.deepEqual(parseLine('PWR1'), { type: 'power', on: false });
  assert.deepEqual(parseLine('VOL069'), { type: 'volume', raw: 69 });
  assert.deepEqual(parseLine('MUT0'), { type: 'mute', muted: true });
  assert.deepEqual(parseLine('MUT1'), { type: 'mute', muted: false });
  assert.deepEqual(parseLine('FN25'), { type: 'input', code: '25' });
  assert.deepEqual(parseLine('RGD<003><VSX-528/SYXE8    >'), {
    type: 'model',
    model: 'VSX-528/SYXE8',
  });
});

test('parseLine ignores the heartbeat and keeps unknown lines apart', () => {
  assert.equal(parseLine('R'), null);
  assert.equal(parseLine('  '), null);
  assert.deepEqual(parseLine('RGC100000001000000000000000000000'), {
    type: 'unknown',
    line: 'RGC100000001000000000000000000000',
  });
});

test('volume conversion follows the receiver display', () => {
  assert.equal(rawToDb(161), 0);
  assert.equal(rawToDb(69), -46);
  assert.equal(rawToDb(185), 12);
  assert.equal(rawToDb(0), -80);
  assert.equal(dbToRaw(-46), 69);
  assert.equal(dbToRaw(50), 185);
  assert.equal(dbToRaw(-100), 1);
});

test('splitLines keeps the unfinished tail for the next chunk', () => {
  assert.deepEqual(splitLines('PWR0\r\nVOL0'), { lines: ['PWR0'], rest: 'VOL0' });
  assert.deepEqual(splitLines('R\rFN25\r'), { lines: ['R', 'FN25'], rest: '' });
});

test('isSafeCommand refuses line breaks and oversized commands', () => {
  assert.ok(isSafeCommand('0100SR'));
  assert.ok(isSafeCommand('?P'));
  assert.ok(!isSafeCommand('PO\rPF'));
  assert.ok(!isSafeCommand(''));
  assert.ok(!isSafeCommand('x'.repeat(33)));
  assert.ok(!isSafeCommand(42));
});

test('input codes and custom names', () => {
  assert.equal(normalizeInputCode('5'), '05');
  assert.equal(normalizeInputCode(' 25 '), '25');
  assert.equal(normalizeInputCode('abc'), null);
  const inputs = buildInputList('25=Apple TV, 5 = Télé, 99=Extra, broken, =x');
  assert.equal(inputs.find((i) => i.code === '25').name, 'Apple TV');
  assert.equal(inputs.find((i) => i.code === '05').name, 'Télé');
  assert.equal(inputs.find((i) => i.code === '99').name, 'Extra');
  assert.equal(inputs.find((i) => i.code === '04').name, 'DVD');
});
