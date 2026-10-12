import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FEATURE, MAIN, ZONE2, buildReceiverDevices, receivers } from '../src/devices/receiver.js';
import {
  buildRemoteContent,
  createRefresher,
  resolveTarget,
  runRemoteAction,
} from '../src/widgets.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { createFakeReceiver } from './helpers/fakeSocket.js';
import { simulatedReceiver } from './helpers/simulatedReceiver.js';

const config = normalizeConfig({ input_names: '25=Apple TV' });
const gladys = createFakeGladys();
const RECEIVER = {
  platformId: 'uuid-1120',
  host: '192.0.2.31',
  port: 8102,
  model: 'VSX-1120/KUXJ',
  capabilities: { zone2: true, zone3: false, inputNames: false, listeningModeQuery: false },
  inputs: [],
};

async function connect() {
  const sim = simulatedReceiver('full');
  const fake = createFakeReceiver((c) => sim.answer(c));
  const devices = buildReceiverDevices(gladys, RECEIVER, config);
  receivers.sync(gladys, devices, { createConnection: fake.createConnection });
  const connection = receivers.find(RECEIVER.platformId);
  while (!connection.connected || !connection.model) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return { sim, fake, devices, connection };
}

afterEach(() => receivers.stopAll());

test('without a receiver the widget says how to add one', () => {
  const content = buildRemoteContent(gladys, null, config);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('the main zone remote shows the state and fits the widget rules', async () => {
  const { devices } = await connect();
  const target = resolveTarget(gladys, { receiver: devices[0].external_id });
  const content = buildRemoteContent(gladys, target, config);
  assert.deepEqual(validateWidgetContent(content), []);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((t) => t.value ?? 'live'),
    ['ON', 'live', 'Apple TV', '?'],
  );
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.equal(buttons.length, 4);
  assert.deepEqual(buttons[3].action.params.mode, 'advanced');
});

test('the buttons drive the receiver and the mode toggle alternates', async () => {
  const { sim, fake, devices, connection } = await connect();
  const receiver = devices[0].external_id;
  await runRemoteAction(gladys, {
    actionKey: 'mode',
    params: { receiver, mode: 'advanced' },
    config,
  });
  assert.ok(fake.written.includes('0100SR\r'));
  let content = buildRemoteContent(gladys, { connection, zone: MAIN }, config);
  assert.equal(content.components.at(-1).action.params.mode, 'auto_surround');
  await runRemoteAction(gladys, {
    actionKey: 'mode',
    params: { receiver, mode: 'auto_surround' },
    config,
  });
  assert.ok(fake.written.includes('0006SR\r'));
  content = buildRemoteContent(gladys, { connection, zone: MAIN }, config);
  assert.equal(content.components.at(-1).action.params.mode, 'advanced');
  await runRemoteAction(gladys, { actionKey: 'power', params: { receiver, on: 0 }, config });
  assert.equal(sim.state.power, 2);
});

test('a zone 2 remote toggles mute instead of the listening mode', async () => {
  const { devices } = await connect();
  const target = resolveTarget(gladys, { receiver: devices[1].external_id });
  assert.equal(target.zone, ZONE2);
  const content = buildRemoteContent(gladys, target, config);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components.at(-1).action.key, 'mute');
  assert.equal(
    content.components.find((c) => c.device_feature?.endsWith(FEATURE.VOLUME)).device_feature,
    gladys.externalIds(ZONE2, RECEIVER.platformId).feature(FEATURE.VOLUME),
  );
});

test('refreshes are coalesced under the Gladys rate limit', async () => {
  const fake = createFakeGladys();
  const refresh = createRefresher(fake, 30);
  refresh();
  refresh();
  refresh();
  await new Promise((r) => setTimeout(r, 50));
  refresh();
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(fake.widgetRefreshes, ['remote', 'remote']);
});
