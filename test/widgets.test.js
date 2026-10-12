import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FEATURE, ZONE2, buildReceiverDevices, receivers } from '../src/devices/receiver.js';
import { buildRemoteContent, createRefresher, resolveTarget } from '../src/widgets.js';
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

const tiles = (content) =>
  content.components.filter((c) => c.type === 'value').map((c) => c.value ?? c.device_feature);

afterEach(() => receivers.stopAll());

test('without a receiver the widget says how to add one', () => {
  const content = buildRemoteContent(gladys, null, config);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('the widget shows power, live volume, sound and input, in French too', async () => {
  const { devices, fake } = await connect();
  const target = resolveTarget(gladys, { receiver: devices[0].external_id });
  const volumeId = gladys.externalIds('receiver', RECEIVER.platformId).feature(FEATURE.VOLUME);
  let content = buildRemoteContent(gladys, target, config, 'fr');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(tiles(content), ['ALLUMÉ', volumeId, 'ACTIF', 'Apple TV']);
  assert.equal(content.components.filter((c) => c.type === 'button').length, 0);
  fake.push('MUT0');
  fake.push('PWR2');
  await new Promise((r) => setImmediate(r));
  content = buildRemoteContent(gladys, target, config, 'en');
  assert.deepEqual(tiles(content), ['STANDBY', volumeId, 'MUTED', 'Apple TV']);
});

test('a zone 2 widget follows the zone 2 features', async () => {
  const { devices } = await connect();
  const target = resolveTarget(gladys, { receiver: devices[1].external_id });
  assert.equal(target.zone, ZONE2);
  const content = buildRemoteContent(gladys, target, config);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(
    tiles(content)[1],
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
