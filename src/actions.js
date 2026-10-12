// -----------------------------------------------------------------------------
// Manifest actions: buttons in the Configuration screen of the integration.
// The resolved message is shown under the button; throwing shows the error.
// -----------------------------------------------------------------------------

import { receivers, routeOf } from './devices/index.js';
import { probeReceiver } from './pioneer/probe.js';
import { isSafeCommand } from './pioneer/protocol.js';
import { parseHosts } from './discovery.js';

/** The receiver connection a "device" select points at (or the only one). */
export function connectionFor(gladys, deviceExternalId) {
  if (deviceExternalId) {
    const route = routeOf(gladys, { external_id: deviceExternalId });
    const connection = route && receivers.find(route.platformId);
    if (!connection) {
      throw new Error('This receiver is not connected.');
    }
    return connection;
  }
  const connection = receivers.find();
  if (!connection) {
    throw new Error('Choose the receiver.');
  }
  return connection;
}

export const ACTIONS = {
  /** Check an IP address before adding it: is it a supported receiver? */
  async check_address(gladys, { fields }) {
    const [host] = parseHosts(fields.host);
    if (!host) {
      throw new Error('Enter an IP address.');
    }
    const result = await probeReceiver(host);
    if (result?.protocol === 'legacy') {
      const model = result.model ?? 'Pioneer';
      const extras = [
        result.capabilities.zone2 && 'zone 2',
        result.capabilities.inputNames && 'input names',
      ]
        .filter(Boolean)
        .join(', ');
      return {
        en: `${model} found on port ${result.port}${extras ? ` (${extras})` : ''}. Add the address to "Receiver addresses" if the scan does not find it.`,
        fr: `${model} trouvé sur le port ${result.port}${extras ? ` (${extras})` : ''}. Ajoutez l'adresse dans « Adresses des amplis » si le scan ne le trouve pas.`,
      };
    }
    if (result?.protocol === 'eiscp') {
      return {
        en: 'This is a recent receiver (Onkyo protocol): use the Onkyo integration instead.',
        fr: "C'est un ampli récent (protocole Onkyo) : utilisez plutôt l'intégration Onkyo.",
      };
    }
    throw new Error(
      `Nothing answered at ${host} on ports 8102, 23 or 60128. Is Network Standby on?`,
    );
  },

  /** Show the state of every connected receiver. */
  async test_connection() {
    const list = receivers.list();
    if (list.length === 0) {
      throw new Error('No receiver added yet: run a scan in the Discovery tab.');
    }
    const lines = list.map((c) => `${c.model ?? c.host} (${c.key}): ${c.connected ? 'OK' : 'KO'}`);
    const linesFr = list.map(
      (c) => `${c.model ?? c.host} (${c.key}) : ${c.connected ? 'connecté' : 'injoignable'}`,
    );
    return { en: lines.join(' · '), fr: linesFr.join(' · ') };
  },

  /** Send any protocol command and show the raw answer. */
  async send_command(gladys, { fields }) {
    const command = String(fields.command ?? '').trim();
    if (!isSafeCommand(command)) {
      throw new Error('Invalid command (printable ASCII, 32 characters at most).');
    }
    const connection = connectionFor(gladys, fields.device);
    connection.requireConnected();
    const lines = await connection.client.send(command, { timeoutMs: 1_500 });
    const answer = lines.length > 0 ? lines.join(' | ') : null;
    return {
      en: answer
        ? `${command} -> ${answer}`
        : `${command} sent, no answer (normal for some commands).`,
      fr: answer
        ? `${command} -> ${answer}`
        : `${command} envoyé, pas de réponse (normal pour certaines commandes).`,
    };
  },
};
