import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverReceivers, parseHosts, platformIdOf } from '../src/discovery.js';
import { isPioneer, parseDescription, parseSsdpHeaders, uuidFromUsn } from '../src/pioneer/upnp.js';
import { probeReceiver } from '../src/pioneer/probe.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeReceiver } from './helpers/fakeSocket.js';
import { simulatedReceiver } from './helpers/simulatedReceiver.js';

const PIONEER_XML = `<?xml version="1.0"?><root><device>
  <friendlyName>Salon</friendlyName><manufacturer>PIONEER CORPORATION</manufacturer>
  <modelName>VSX-528</modelName><UDN>uuid:5F9EC1B3-ED59-79BB-4530-745E1C0A1B2C</UDN>
</device></root>`;
const TV_XML = `<root><device><manufacturer>LG Electronics</manufacturer>
  <modelName>OLED55C1</modelName><UDN>uuid:aaaa</UDN></device></root>`;

test('UPnP helpers', () => {
  const headers = parseSsdpHeaders(
    'HTTP/1.1 200 OK\r\nLOCATION: http://192.0.2.30:8080/desc.xml\r\nUSN: uuid:ABC-1::upnp:rootdevice\r\n',
  );
  assert.equal(headers.location, 'http://192.0.2.30:8080/desc.xml');
  assert.equal(uuidFromUsn(headers.usn), 'abc-1');
  const description = parseDescription(PIONEER_XML);
  assert.equal(description.modelName, 'VSX-528');
  assert.equal(description.uuid, '5f9ec1b3-ed59-79bb-4530-745e1c0a1b2c');
  assert.ok(isPioneer(description));
  assert.ok(!isPioneer(parseDescription(TV_XML)));
});

test('settings helpers', () => {
  assert.deepEqual(parseHosts(' 192.0.2.30, 192.0.2.31;192.0.2.30 bad/host '), [
    '192.0.2.30',
    '192.0.2.31',
  ]);
  assert.equal(platformIdOf({ uuid: 'abc', host: '192.0.2.1' }), 'abc');
  assert.equal(platformIdOf({ mac: 'AA:BB:CC:00:11:22', host: '192.0.2.1' }), 'mac-aabbcc001122');
  assert.equal(platformIdOf({ host: '192.0.2.1' }), 'ip-192-0-2-1');
});

test('probing finds the port and what the model supports', async () => {
  const sim528 = simulatedReceiver('vsx-528');
  const fake528 = createFakeReceiver((c) => sim528.answer(c));
  const small = await probeReceiver('192.0.2.30', { createConnection: fake528.createConnection });
  assert.equal(small.protocol, 'legacy');
  assert.equal(small.port, 8102);
  assert.equal(small.model, 'VSX-528/SYXE8');
  assert.deepEqual(small.capabilities, {
    zone2: false,
    zone3: false,
    listeningModeQuery: false,
    inputNames: false,
  });

  const simBig = simulatedReceiver('full');
  const fakeBig = createFakeReceiver((c) => simBig.answer(c));
  const big = await probeReceiver('192.0.2.31', { createConnection: fakeBig.createConnection });
  assert.ok(big.capabilities.zone2 && big.capabilities.inputNames);
  assert.ok(big.capabilities.listeningModeQuery);
  assert.deepEqual(big.inputs, [
    { code: '04', name: 'DVD' },
    { code: '19', name: 'HDMI 1' },
    { code: '25', name: 'BD' },
  ]);
});

test('discovery merges SSDP and typed addresses, keeps only Pioneers', async () => {
  const gladys = {
    async scanNetwork(type) {
      assert.equal(type, 'ssdp');
      return [
        { source_ip: '192.0.2.30', headers: 'LOCATION: http://192.0.2.30/p.xml\r\n' },
        { source_ip: '192.0.2.40', headers: 'LOCATION: http://192.0.2.40/tv.xml\r\n' },
      ];
    },
  };
  const probed = [];
  const result = await discoverReceivers(
    gladys,
    normalizeConfig({ hosts: '192.0.2.50, 192.0.2.30' }),
    {
      fetchDesc: async (url) => parseDescription(url.includes('/p.xml') ? PIONEER_XML : TV_XML),
      search: async () => null,
      probe: async (host) => {
        probed.push(host);
        if (host === '192.0.2.50') {
          return { protocol: 'eiscp' };
        }
        return {
          protocol: 'legacy',
          port: 8102,
          model: 'VSX-528/SYXE8',
          capabilities: { zone2: false },
          inputs: [],
        };
      },
    },
  );
  assert.deepEqual(probed, ['192.0.2.30', '192.0.2.50'], 'the TV is never probed');
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].platformId, '5f9ec1b3-ed59-79bb-4530-745e1c0a1b2c');
  assert.equal(result.receivers[0].friendlyName, 'Salon');
  assert.deepEqual(result.ignored, [{ host: '192.0.2.50', reason: 'eiscp' }]);
});
