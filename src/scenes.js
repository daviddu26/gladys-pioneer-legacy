// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+), declared in the manifest `scene_actions`.
//
// `send_command` covers everything the device features do not: any command of
// the legacy Pioneer protocol, e.g. "0100SR" sent several times in a row to
// cycle the advanced listening modes. The receiver's answer (if any) is
// returned as an output, readable by the next actions of the scene.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { connectionFor } from './actions.js';
import { isSafeCommand } from './pioneer/protocol.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  async send_command(gladys, { fields }) {
    const command = String(fields.command ?? '').trim();
    if (!isSafeCommand(command)) {
      throw new Error(`Invalid command: ${JSON.stringify(fields.command)}`);
    }
    logger.info(`Scene action send_command <- ${command}`);
    const connection = connectionFor(gladys, fields.device);
    connection.requireConnected();
    const lines = await connection.client.send(command, { timeoutMs: 1_500 });
    return { response: lines.join(' | ') };
  },
};
