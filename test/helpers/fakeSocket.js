// -----------------------------------------------------------------------------
// In-memory stand-in for a TCP socket and a scripted Pioneer receiver, so the
// client can be tested without any network.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

/**
 * @param {(command: string) => string[]} answer lines the fake receiver sends
 * back for each command it receives (without the line end)
 */
export function createFakeReceiver(answer) {
  const written = [];
  let socket = null;

  function createConnection() {
    socket = new EventEmitter();
    socket.destroyed = false;
    socket.write = (data) => {
      written.push(data);
      const command = data.replace(/\r$/, '');
      if (command === '') {
        return;
      }
      const lines = answer(command) ?? [];
      if (lines.length > 0) {
        setImmediate(() => socket.emit('data', lines.map((l) => `${l}\r\n`).join('')));
      }
    };
    socket.destroy = () => {
      if (!socket.destroyed) {
        socket.destroyed = true;
        setImmediate(() => socket.emit('close'));
      }
    };
    setImmediate(() => socket.emit('connect'));
    return socket;
  }

  return {
    written,
    createConnection,
    push: (line) => socket.emit('data', `${line}\r\n`),
    drop: () => socket.destroy(),
  };
}
