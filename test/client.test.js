import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PioneerClient } from '../src/pioneer/client.js';
import { createFakeReceiver } from './helpers/fakeSocket.js';

function answers(command) {
  return {
    '?P': ['PWR0'],
    '?PQ': ['PWR0'], // the receiver only reads the prefix
    '?V': ['VOL069'],
    VU: ['VOL071'],
    '0100SR': ['R'],
  }[command];
}

async function connectedClient(fake) {
  const client = new PioneerClient({
    host: '192.0.2.1',
    port: 8102,
    createConnection: fake.createConnection,
  });
  client.start();
  await once(client, 'connected');
  return client;
}

test('send resolves with the first line matching the expected prefix', async () => {
  const fake = createFakeReceiver(answers);
  const client = await connectedClient(fake);
  assert.equal(await client.send('?V', { expectPrefix: 'VOL' }), 'VOL069');
  assert.equal(fake.written.at(-1), '?V\r');
  // A query the receiver misreads must not be taken for an answer.
  assert.equal(await client.send('?PQ', { expectPrefix: 'PQ', timeoutMs: 50 }), null);
  client.stop();
});

test('silence is not an error: an unconfirmed command resolves null', async () => {
  const fake = createFakeReceiver(answers);
  const client = await connectedClient(fake);
  assert.equal(await client.send('?S', { expectPrefix: 'SR', timeoutMs: 50 }), null);
  // Raw mode collects every line but the heartbeat.
  assert.deepEqual(await client.send('0100SR', { timeoutMs: 50 }), []);
  client.stop();
});

test('pushed lines become state events', async () => {
  const fake = createFakeReceiver(answers);
  const client = await connectedClient(fake);
  const event = once(client, 'state');
  fake.push('FN05');
  assert.deepEqual((await event)[0], { type: 'input', code: '05' });
  client.stop();
});

test('commands are refused when unsafe or disconnected', async () => {
  const fake = createFakeReceiver(answers);
  const client = await connectedClient(fake);
  await assert.rejects(client.send('PO\rPF'), /Invalid command/);
  client.stop();
  await assert.rejects(client.send('?P'), /not connected/);
});

test('a dropped connection rejects pending commands and is reported', async () => {
  const fake = createFakeReceiver(() => []);
  const client = await connectedClient(fake);
  const pending = client.send('?P', { expectPrefix: 'PWR', timeoutMs: 5_000 });
  const disconnected = once(client, 'disconnected');
  fake.drop();
  await assert.rejects(pending, /closed/);
  await disconnected;
  client.stop();
});
