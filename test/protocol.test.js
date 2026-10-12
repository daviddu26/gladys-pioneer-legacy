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
  zone2DbToRaw,
  zone2RawToDb,
  listeningModeName,
  decodeInputs,
  encodeInputs,
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
  const inputs = buildInputList([], '25=Apple TV, 5 = Télé, 99=Extra, broken, =x');
  assert.equal(inputs.find((i) => i.code === '25').name, 'Apple TV');
  assert.equal(inputs.find((i) => i.code === '05').name, 'Télé');
  assert.equal(inputs.find((i) => i.code === '99').name, 'Extra');
  assert.equal(inputs.find((i) => i.code === '04').name, 'DVD');
});

test("the receiver's own input names replace the default list", () => {
  const inputs = buildInputList([{ code: '19', name: 'HDMI 1' }], '19=Apple TV');
  assert.deepEqual(inputs, [{ code: '19', name: 'Apple TV' }]);
  assert.deepEqual(decodeInputs(encodeInputs([{ code: '01', name: 'CD, SACD' }])), [
    { code: '01', name: 'CD  SACD' },
  ]);
});

test('zone 2/3 and listening mode lines, from the official sheets', () => {
  assert.deepEqual(parseLine('APR0'), { type: 'zone2-power', on: true });
  assert.deepEqual(parseLine('ZV61'), { type: 'zone2-volume', raw: 61 });
  assert.deepEqual(parseLine('Z2MUT0'), { type: 'zone2-mute', muted: true });
  assert.deepEqual(parseLine('Z2F04'), { type: 'zone2-input', code: '04' });
  assert.deepEqual(parseLine('BPR1'), { type: 'zone3-power', on: false });
  assert.deepEqual(parseLine('YV81'), { type: 'zone3-volume', raw: 81 });
  assert.deepEqual(parseLine('Z3MUT1'), { type: 'zone3-mute', muted: false });
  assert.deepEqual(parseLine('Z3F25'), { type: 'zone3-input', code: '25' });
  assert.deepEqual(parseLine('SR0112'), { type: 'listening-mode', code: '0112' });
  assert.deepEqual(parseLine('RGB191HDMI 1'), { type: 'input-name', code: '19', name: 'HDMI 1' });
  assert.equal(listeningModeName('0112'), 'EXTENDED STEREO');
  assert.equal(listeningModeName('9999'), 'MODE 9999');
  assert.equal(zone2RawToDb(81), 0);
  assert.equal(zone2RawToDb(61), -20);
  assert.equal(zone2DbToRaw(-20), 61);
  assert.equal(zone2DbToRaw(10), 81);
});
