// -----------------------------------------------------------------------------
// TCP client for a legacy Pioneer receiver.
//
// Keeps ONE long-lived connection open (the receiver pushes its state changes
// on it), reconnects with a capped backoff when it drops, and treats a long
// silence as a dead link: the receiver says "R" about every 30 s, so nothing
// at all for 90 s means the socket is half-open (receiver unplugged...).
//
// Events:
//   'state'        (parsed line from protocol.parseLine, never null)
//   'connected'    the socket is open
//   'disconnected' the socket closed (a reconnection is scheduled)
// -----------------------------------------------------------------------------

import net from 'node:net';
import { EventEmitter } from 'node:events';
import { parseLine, splitLines, isSafeCommand } from './protocol.js';

const SILENCE_TIMEOUT_MS = 90_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const CONNECT_TIMEOUT_MS = 5_000;
// Some models drop the very first command after the connection: we send an
// empty line first and wait a little before talking.
const WAKE_DELAY_MS = 300;

export class PioneerClient extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {object} [options.logger]
   * @param {Function} [options.createConnection] injected by the tests
   */
  constructor({ host, port, logger, createConnection }) {
    super();
    this.host = host;
    this.port = port;
    this.logger = logger;
    this.createConnection = createConnection ?? net.createConnection;
    this.socket = null;
    this.connected = false;
    this.stopped = true;
    this.buffer = '';
    this.waiters = new Set();
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.reconnectTimer = null;
    this.silenceTimer = null;
  }

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.silenceTimer);
    this.rejectWaiters(new Error('Client stopped'));
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  open() {
    if (this.stopped) {
      return;
    }
    this.logger?.debug(`Connecting to ${this.host}:${this.port}`);
    const socket = this.createConnection({ host: this.host, port: this.port });
    this.socket = socket;
    this.buffer = '';
    socket.setEncoding?.('ascii');
    socket.setTimeout?.(CONNECT_TIMEOUT_MS);

    socket.on('connect', () => {
      socket.setTimeout?.(0);
      socket.setKeepAlive?.(true, 30_000);
      this.connected = true;
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.armSilenceTimer();
      socket.write('\r');
      setTimeout(() => {
        if (this.socket === socket && this.connected) {
          this.emit('connected');
        }
      }, WAKE_DELAY_MS);
    });

    socket.on('data', (chunk) => {
      // Ignore what a socket we already gave up on still delivers.
      if (this.socket === socket) {
        this.onData(String(chunk));
      }
    });

    socket.on('timeout', () => {
      this.logger?.warn(`No answer from ${this.host}:${this.port}`);
      socket.destroy();
    });

    socket.on('error', (err) => {
      this.logger?.warn(`Connection error with ${this.host}:${this.port}: ${err.message}`);
    });

    socket.on('close', () => {
      if (this.socket !== socket) {
        return;
      }
      const wasConnected = this.connected;
      this.connected = false;
      this.socket = null;
      clearTimeout(this.silenceTimer);
      this.rejectWaiters(new Error('Connection closed'));
      if (wasConnected) {
        this.emit('disconnected');
      }
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.stopped) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  armSilenceTimer() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.logger?.warn('Receiver silent for too long, reconnecting');
      this.socket?.destroy();
    }, SILENCE_TIMEOUT_MS);
    // The SDK keeps the process alive; this watchdog must not on its own.
    this.silenceTimer.unref?.();
  }

  onData(chunk) {
    this.armSilenceTimer();
    const { lines, rest } = splitLines(this.buffer + chunk);
    this.buffer = rest.length > 1024 ? '' : rest;
    for (const line of lines) {
      this.logger?.debug(`<- ${line}`);
      for (const waiter of this.waiters) {
        waiter.onLine(line);
      }
      const state = parseLine(line);
      if (state) {
        this.emit('state', state);
      }
    }
  }

  rejectWaiters(err) {
    for (const waiter of [...this.waiters]) {
      waiter.fail(err);
    }
  }

  /**
   * Send a command. When `expectPrefix` is given, resolve with the first line
   * starting with it (or null after `timeoutMs`: the receiver never reports
   * errors, so silence is not an exception). Without it, resolve with every
   * line received during `timeoutMs` (raw command test).
   */
  send(command, { expectPrefix, timeoutMs = 1_500 } = {}) {
    if (!isSafeCommand(command)) {
      return Promise.reject(new Error(`Invalid command: ${JSON.stringify(command)}`));
    }
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error(`Receiver ${this.host}:${this.port} is not connected`));
    }
    this.logger?.debug(`-> ${command}`);
    return new Promise((resolve, reject) => {
      const received = [];
      const waiter = {
        onLine: (line) => {
          if (line === 'R') {
            return;
          }
          if (expectPrefix === undefined) {
            received.push(line);
          } else if (line.startsWith(expectPrefix)) {
            done(line);
          }
        },
        fail: (err) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          reject(err);
        },
      };
      const done = (value) => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(value);
      };
      const timer = setTimeout(() => done(expectPrefix === undefined ? received : null), timeoutMs);
      this.waiters.add(waiter);
      this.socket.write(`${command}\r`);
    });
  }
}
