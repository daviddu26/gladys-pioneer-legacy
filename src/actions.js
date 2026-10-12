// -----------------------------------------------------------------------------
// Manifest actions: buttons in the Configuration screen of the integration.
// The resolved message is shown under the button; throwing shows the error.
// -----------------------------------------------------------------------------

import { receiver } from './devices/receiver.js';
import { isSafeCommand, rawToDb } from './pioneer/protocol.js';

export const ACTIONS = {
  /** Show what the integration currently knows about the receiver. */
  async test_connection() {
    const s = receiver.status();
    if (!s.connected) {
      throw new Error(
        'Not connected to the receiver: check its IP address and that Network Standby is on.',
      );
    }
    const power = s.on === null ? '?' : s.on ? 'on' : 'standby';
    const powerFr = s.on === null ? '?' : s.on ? 'allumé' : 'veille';
    const volume = s.raw === null ? '?' : `${rawToDb(s.raw)} dB`;
    const model = s.model ?? '?';
    const input = s.input ?? '?';
    return {
      en: `Connected to ${model}: ${power}, volume ${volume}, input ${input}.`,
      fr: `Connecté à ${model} : ${powerFr}, volume ${volume}, entrée ${input}.`,
    };
  },

  /** Send any protocol command and show the raw answer. */
  async send_command(gladys, { fields }) {
    const command = String(fields.command ?? '').trim();
    if (!isSafeCommand(command)) {
      throw new Error('Invalid command (printable ASCII, 32 characters at most).');
    }
    const lines = await receiver.sendRaw(command);
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
