// -----------------------------------------------------------------------------
// Probe one receiver: which port answers the legacy protocol, which model it
// is, and which optional features it supports. Run at discovery time only, so
// the device Gladys creates has the right features from the start.
//
// A model is never assumed from its name: every capability is asked to the
// receiver itself, because the same command list varies between models of
// the same year.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { once } from 'node:events';
import { PioneerClient } from './client.js';
import { COMMANDS, PROBED_INPUT_CODES, parseLine } from './protocol.js';

export const LEGACY_PORTS = [8102, 23];
const EISCP_PORT = 60128;
const CONNECT_TIMEOUT_MS = 3_000;

/** Is a TCP port open? Resolves false on refusal or timeout. */
export function isPortOpen(
  host,
  port,
  { timeoutMs = 1_500, createConnection = net.createConnection } = {},
) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (open) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(open);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

async function openClient(host, port, options) {
  const client = new PioneerClient({ host, port, ...options });
  client.start();
  const timeout = new Promise((resolve) => setTimeout(resolve, CONNECT_TIMEOUT_MS, 'timeout'));
  const result = await Promise.race([once(client, 'connected').then(() => 'ok'), timeout]);
  if (result !== 'ok') {
    client.stop();
    return null;
  }
  return client;
}

async function query(client, command, prefix, timeoutMs = 1_000) {
  const line = await client.send(command, { expectPrefix: prefix, timeoutMs });
  return line === null ? null : parseLine(line);
}

/**
 * Probe a receiver at `host`.
 * Resolves one of:
 *   { protocol: 'legacy', port, model, capabilities, inputs }
 *   { protocol: 'eiscp' }   a recent Pioneer/Onkyo: not for this integration
 *   null                    nothing answered
 */
export async function probeReceiver(host, { ports = LEGACY_PORTS, logger, createConnection } = {}) {
  for (const port of ports) {
    const client = await openClient(host, port, { logger, createConnection });
    if (!client) {
      continue;
    }
    try {
      const power = await query(client, COMMANDS.powerQuery, 'PWR');
      if (!power) {
        // Something listens on that port, but not the Pioneer protocol.
        continue;
      }
      const model = (await query(client, COMMANDS.modelQuery, 'RGD', 3_000))?.model ?? null;
      const capabilities = {
        zone2: Boolean(await query(client, COMMANDS.zone2PowerQuery, 'APR')),
        zone3: Boolean(await query(client, COMMANDS.zone3PowerQuery, 'BPR')),
        listeningModeQuery: Boolean(await query(client, COMMANDS.listeningModeQuery, 'SR')),
        inputNames: false,
      };
      const inputs = [];
      const current = await query(client, COMMANDS.inputQuery, 'FN');
      if (current && (await query(client, COMMANDS.inputNameQuery(current.code), 'RGB'))) {
        capabilities.inputNames = true;
        for (const code of PROBED_INPUT_CODES) {
          const named = await query(client, COMMANDS.inputNameQuery(code), `RGB${code}`, 300);
          if (named?.type === 'input-name') {
            inputs.push({ code, name: named.name });
          }
        }
      }
      return { protocol: 'legacy', port, model, capabilities, inputs };
    } finally {
      client.stop();
    }
  }
  if (await isPortOpen(host, EISCP_PORT, { createConnection })) {
    return { protocol: 'eiscp' };
  }
  return null;
}
