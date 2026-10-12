import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { buildDiscoveredDevices } from '../src/devices/index.js';
import { FEATURE, receiver } from '../src/devices/receiver.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { createFakeReceiver } from './helpers/fakeSocket.js';

const config = normalizeConfig({ host: '192.0.2.30', max_volume_db: -40 });

// A tiny simulated VSX-528: enough state to answer what the integration asks.
function simulatedReceiver() {
  const state = { power: 0, vol: 69, mute: 1, input: '25' };
  const vol = () => `VOL${String(state.vol).padStart(3, '0')}`;
  return {
    state,
    answer(command) {
      switch (command) {
        case '?P':
          return [`PWR${state.power}`];
        case '?V':
          return [vol()];
        case '?M':
          return [`MUT${state.mute}`];
        case '?F':
          return [`FN${state.input}`];
        case '?RGD':
          return ['RGD<003><VSX-528/SYXE8    >'];
        case 'PF':
          state.power = 2;
          return ['PWR2'];
        case 'PO':
          state.power = 0;
          return ['PWR0', vol()];
        case 'VU':
          state.vol += 2;
          return [vol()];
        case 'VD':
          state.vol -= 2;
          return [vol()];
        case 'MO':
          state.mute = 0;
          return ['MUT0'];
        default:
          if (/^\d\dFN$/.test(command)) {
            state.input = command.slice(0, 2);
            return [`FN${state.input}`];
          }
          return [];
      }
    },
  };
}

const gladys = createFakeGladys();
const id = (key) => gladys.externalIds('receiver', 'main').feature(key);
const feature = (key) => ({ external_id: id(key) });

async function start() {
  const sim = simulatedReceiver();
  const fake = createFakeReceiver((c) => sim.answer(c));
  gladys.published.length = 0;
  receiver.startPush(gladys, config, { createConnection: fake.createConnection });
  // Wait for the initial state read (the model is the last query).
  while (!receiver.status().connected || !receiver.status().model) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return { sim, fake };
}

afterEach(() => receiver.stopPush());

test('no device is offered before an address is configured', () => {
  assert.deepEqual(buildDiscoveredDevices(gladys, normalizeConfig()), []);
});

test('the discovered receiver exposes its features with stable ids', () => {
  const [device] = buildDiscoveredDevices(gladys, config);
  assert.equal(device.external_id, 'receiver:main');
  const byId = Object.fromEntries(device.features.map((f) => [f.external_id, f]));
  assert.equal(byId[id(FEATURE.POWER)].type, DEVICE_FEATURE_TYPES.TELEVISION.BINARY);
  assert.equal(byId[id(FEATURE.VOLUME)].max, -40, 'the slider stops at the configured max');
  const inputs = byId[id(FEATURE.INPUT)].supported_options.map((o) => o.value);
  assert.ok(inputs.includes('25') && inputs.includes('05'));
  const modes = byId[id(FEATURE.LISTENING_MODE)].supported_options.map((o) => o.value);
  assert.deepEqual(modes, ['auto_surround', 'advanced']);
});

test('the initial state is read and published on connection', async () => {
  await start();
  const states = Object.fromEntries(gladys.published.map((p) => [p.featureExternalId, p.state]));
  assert.equal(states[id(FEATURE.POWER)], 1, 'PWR0 means on');
  assert.equal(states[id(FEATURE.VOLUME)], -46);
  assert.equal(states[id(FEATURE.MUTE)], 0);
  assert.deepEqual(states[id(FEATURE.INPUT)], { text: '25' });
});

test('commands from Gladys reach the receiver', async () => {
  const { sim, fake } = await start();
  await receiver.onSetValue(gladys, { feature: feature(FEATURE.POWER), value: 1, config });
  assert.equal(sim.state.power, 0);
  await receiver.onSetValue(gladys, { feature: feature(FEATURE.INPUT), value: '5', config });
  assert.equal(sim.state.input, '05');
  await receiver.onSetValue(gladys, { feature: feature(FEATURE.MUTE), value: 1, config });
  assert.equal(sim.state.mute, 0);
  await receiver.onSetValue(gladys, {
    feature: feature(FEATURE.LISTENING_MODE),
    value: 'advanced',
    config,
  });
  assert.ok(fake.written.includes('0100SR\r'));
});

test('the volume is stepped to the target and capped at the max', async () => {
  const { sim } = await start();
  await receiver.onSetValue(gladys, { feature: feature(FEATURE.VOLUME), value: -50, config });
  assert.equal(sim.state.vol, 61); // -50 dB
  await receiver.onSetValue(gladys, { feature: feature(FEATURE.VOLUME), value: 0, config });
  assert.equal(sim.state.vol, 81); // capped at -40 dB
  await assert.rejects(
    receiver.onSetValue(gladys, { feature: feature(FEATURE.VOLUME_UP), value: 1, config }),
    /Maximum volume/,
  );
});

test('changes made with the remote are pushed to Gladys', async () => {
  const { fake } = await start();
  gladys.published.length = 0;
  fake.push('VOL081');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(gladys.published, [{ featureExternalId: id(FEATURE.VOLUME), state: -40 }]);
});

test('commands fail cleanly when the receiver is not connected', async () => {
  await assert.rejects(
    receiver.onSetValue(gladys, { feature: feature(FEATURE.POWER), value: 1, config }),
    /not connected/,
  );
});
