import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  FEATURE,
  MAIN,
  ZONE2,
  buildReceiverDevices,
  receivers,
  receiversFromDevices,
  routeOf,
} from '../src/devices/receiver.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { createFakeReceiver } from './helpers/fakeSocket.js';
import { simulatedReceiver } from './helpers/simulatedReceiver.js';

const config = normalizeConfig({ max_volume: 44 });
const gladys = createFakeGladys();

const VSX528 = {
  platformId: 'uuid-528',
  host: '192.0.2.30',
  port: 8102,
  model: 'VSX-528/SYXE8',
  capabilities: { zone2: false, zone3: false, inputNames: false, listeningModeQuery: false },
  inputs: [],
};
const BIG = {
  platformId: 'uuid-1120',
  host: '192.0.2.31',
  port: 8102,
  model: 'VSX-1120/KUXJ',
  capabilities: { zone2: true, zone3: false, inputNames: true, listeningModeQuery: true },
  inputs: [
    { code: '25', name: 'BD' },
    { code: '19', name: 'HDMI 1' },
  ],
};

const fid = (zone, receiver, key) => gladys.externalIds(zone, receiver.platformId).feature(key);

/** Create the devices in "Gladys" and connect to a simulated receiver. */
async function connect(receiver, profile) {
  const sim = simulatedReceiver(profile);
  const fake = createFakeReceiver((c) => sim.answer(c));
  const devices = buildReceiverDevices(gladys, receiver, config);
  gladys.published.length = 0;
  receivers.sync(gladys, devices, { createConnection: fake.createConnection });
  const connection = receivers.find(receiver.platformId);
  while (!connection.connected || !connection.model) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return { sim, fake, devices, connection };
}

const states = () =>
  Object.fromEntries(gladys.published.map((p) => [p.featureExternalId, p.state]));

afterEach(() => receivers.stopAll());

test('a VSX-528 gets one device with the features it supports', () => {
  const devices = buildReceiverDevices(gladys, VSX528, config);
  assert.equal(devices.length, 1);
  const [device] = devices;
  assert.equal(device.name, 'Pioneer VSX-528');
  const byId = Object.fromEntries(device.features.map((f) => [f.external_id, f]));
  assert.equal(byId[fid(MAIN, VSX528, FEATURE.POWER)].type, DEVICE_FEATURE_TYPES.TELEVISION.BINARY);
  assert.equal(byId[fid(MAIN, VSX528, FEATURE.VOLUME)].max, 44, 'the slider stops at the max');
  assert.equal(byId[fid(MAIN, VSX528, FEATURE.CURRENT_LISTENING_MODE)], undefined);
  const inputs = byId[fid(MAIN, VSX528, FEATURE.INPUT)].supported_options.map((o) => o.value);
  assert.ok(inputs.includes('25') && inputs.includes('05'), 'the default inputs are offered');
});

test('a bigger model gets zone 2, its own input names and the current mode', () => {
  const devices = buildReceiverDevices(gladys, BIG, config);
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Pioneer VSX-1120', 'Pioneer VSX-1120 (zone 2)'],
  );
  const main = devices[0].features.map((f) => f.external_id);
  assert.ok(main.includes(fid(MAIN, BIG, FEATURE.CURRENT_LISTENING_MODE)));
  const inputs = devices[1].features.find((f) => f.external_id === fid(ZONE2, BIG, FEATURE.INPUT));
  assert.deepEqual(
    inputs.supported_options.map((o) => o.label),
    ['BD', 'HDMI 1'],
  );
});

test('stored params rebuild the same receiver after a restart', () => {
  const devices = buildReceiverDevices(gladys, BIG, config);
  const [rebuilt] = receiversFromDevices(gladys, devices);
  assert.equal(rebuilt.host, BIG.host);
  assert.deepEqual(rebuilt.capabilities, BIG.capabilities);
  assert.deepEqual(rebuilt.inputs, BIG.inputs);
  assert.deepEqual([...rebuilt.zones], [MAIN, ZONE2]);
  assert.deepEqual(routeOf(gladys, devices[1]), { zone: ZONE2, platformId: BIG.platformId });
});

test('the initial state is read and published on connection', async () => {
  await connect(VSX528, 'vsx-528');
  const s = states();
  assert.equal(s[fid(MAIN, VSX528, FEATURE.POWER)], 1, 'PWR0 means on');
  assert.equal(s[fid(MAIN, VSX528, FEATURE.VOLUME)], 37, 'VOL069 is 37 %');
  assert.equal(s[fid(MAIN, VSX528, FEATURE.MUTE)], 0);
  assert.deepEqual(s[fid(MAIN, VSX528, FEATURE.INPUT)], { text: '25' });
});

test('commands from Gladys reach the right receiver and zone', async () => {
  const { sim, fake, devices } = await connect(BIG, 'full');
  const set = (device, key, value) =>
    receivers.onSetValue(gladys, {
      device,
      feature: { external_id: device.external_id + ':' + key },
      value,
      config,
    });
  await set(devices[0], FEATURE.INPUT, '5');
  assert.equal(sim.state.input, '05');
  await set(devices[0], FEATURE.MUTE, 1);
  assert.equal(sim.state.mute, 0);
  await set(devices[0], FEATURE.LISTENING_MODE, 'advanced');
  assert.ok(fake.written.includes('0100SR\r'));
  await set(devices[1], FEATURE.POWER, 1);
  assert.equal(sim.state.z2power, 0);
  await set(devices[1], FEATURE.VOLUME, 38);
  assert.equal(sim.state.z2vol, 31, 'zone 2 volume is stepped 1 dB at a time');
  assert.deepEqual(states()[fid(MAIN, BIG, FEATURE.CURRENT_LISTENING_MODE)], {
    text: 'EXTENDED STEREO',
  });
});

test('the main volume is stepped to the target and capped at the max', async () => {
  const { sim, devices } = await connect(VSX528, 'vsx-528');
  const set = (key, value) =>
    receivers.onSetValue(gladys, {
      device: devices[0],
      feature: { external_id: fid(MAIN, VSX528, key) },
      value,
      config,
    });
  await set(FEATURE.VOLUME, 33);
  assert.equal(sim.state.vol, 61);
  await set(FEATURE.VOLUME, 100);
  assert.equal(sim.state.vol, 81, 'capped at 44 %');
  await assert.rejects(set(FEATURE.VOLUME_UP, 1), /Maximum volume/);
});

test('changes made with the remote are pushed to Gladys', async () => {
  const { fake } = await connect(VSX528, 'vsx-528');
  gladys.published.length = 0;
  fake.push('VOL081');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(gladys.published, [
    { featureExternalId: fid(MAIN, VSX528, FEATURE.VOLUME), state: 44 },
  ]);
});

test('deleting the device closes its connection', async () => {
  await connect(VSX528, 'vsx-528');
  receivers.sync(gladys, []);
  assert.equal(receivers.list().length, 0);
  await assert.rejects(
    receivers.onSetValue(gladys, {
      device: { external_id: gladys.externalIds(MAIN, VSX528.platformId).device },
      feature: { external_id: fid(MAIN, VSX528, FEATURE.POWER) },
      value: 1,
      config,
    }),
    /No receiver connection/,
  );
});

test('option labels are plain strings, as the Gladys core requires', () => {
  for (const receiver of [VSX528, BIG]) {
    for (const device of buildReceiverDevices(gladys, receiver, config)) {
      for (const feature of device.features) {
        for (const option of feature.supported_options ?? []) {
          assert.equal(typeof option.label, 'string', `${feature.name}: ${JSON.stringify(option)}`);
          assert.ok(option.label.trim().length > 0);
        }
        const values = (feature.supported_options ?? []).map((o) => String(o.value));
        assert.equal(new Set(values).size, values.length, `${feature.name}: duplicate values`);
      }
    }
  }
});
