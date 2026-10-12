// -----------------------------------------------------------------------------
// Device type: legacy Pioneer AV RECEIVER (one per integration instance).
//
// The receiver pushes its state on the open connection, so Gladys gets every
// change made with the remote or the front panel without any polling. On each
// (re)connection we still ask for the full state once, since changes made
// while the link was down were lost.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { PioneerClient } from '../pioneer/client.js';
import {
  COMMANDS,
  LISTENING_MODES,
  VOLUME_DB_MAX,
  VOLUME_DB_MIN,
  buildInputList,
  dbToRaw,
  normalizeInputCode,
  rawToDb,
} from '../pioneer/protocol.js';

const DEVICE_TYPE = 'receiver';
const logger = createLogger({ name: DEVICE_TYPE });

// The integration drives a single receiver: its platform id is fixed, so the
// device keeps its id (history, scenes, dashboards) when its IP changes.
const PLATFORM_DEVICE_ID = 'main';

// Feature keys are stored by Gladys: never rename one.
export const FEATURE = {
  POWER: 'power',
  VOLUME: 'volume',
  MUTE: 'mute',
  VOLUME_UP: 'volume-up',
  VOLUME_DOWN: 'volume-down',
  INPUT: 'input',
  LISTENING_MODE: 'listening-mode',
};

// Safety net when stepping the volume towards a target (1 dB per step).
const MAX_VOLUME_STEPS = 60;

let client = null;
let clientKey = '';
let model = null;
// Last raw receiver values, used to step the volume and to skip duplicates.
const current = { on: null, raw: null, muted: null, input: null };
const lastPublished = new Map();

function ids(gladys) {
  return gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
}

async function publish(gladys, featureKey, value) {
  const externalId = ids(gladys).feature(featureKey);
  if (lastPublished.get(externalId) === value) {
    return;
  }
  lastPublished.set(externalId, value);
  await gladys.publishState(externalId, value);
}

function requireClient() {
  if (!client || !client.connected) {
    throw new Error('The receiver is not connected');
  }
  return client;
}

/** Apply one parsed line from the receiver to Gladys. */
export async function handleState(gladys, state) {
  switch (state.type) {
    case 'power':
      current.on = state.on;
      await publish(gladys, FEATURE.POWER, state.on ? 1 : 0);
      break;
    case 'volume':
      current.raw = state.raw;
      await publish(gladys, FEATURE.VOLUME, rawToDb(state.raw));
      break;
    case 'mute':
      current.muted = state.muted;
      await publish(gladys, FEATURE.MUTE, state.muted ? 1 : 0);
      break;
    case 'input':
      current.input = state.code;
      await publish(gladys, FEATURE.INPUT, { text: state.code });
      break;
    case 'model':
      model = state.model;
      break;
    default:
      logger.debug(`Unhandled line from the receiver: ${state.line}`);
  }
}

/** Ask the receiver for its whole state (answers arrive as 'state' events). */
async function refreshAll(c) {
  await c.send(COMMANDS.powerQuery, { expectPrefix: 'PWR' });
  await c.send(COMMANDS.volumeQuery, { expectPrefix: 'VOL' });
  await c.send(COMMANDS.muteQuery, { expectPrefix: 'MUT' });
  await c.send(COMMANDS.inputQuery, { expectPrefix: 'FN' });
  await c.send(COMMANDS.modelQuery, { expectPrefix: 'RGD', timeoutMs: 3_000 });
}

/** Step the volume towards a target in dB, never above the configured max. */
async function setVolume(c, targetDb, config) {
  const target = dbToRaw(Math.min(targetDb, config.max_volume_db));
  if (current.raw === null) {
    await c.send(COMMANDS.volumeQuery, { expectPrefix: 'VOL' });
  }
  for (let step = 0; step < MAX_VOLUME_STEPS; step += 1) {
    const raw = current.raw;
    if (raw === null || Math.abs(raw - target) < 2) {
      return;
    }
    const command = raw < target ? COMMANDS.volumeUp : COMMANDS.volumeDown;
    const answer = await c.send(command, { expectPrefix: 'VOL' });
    if (answer === null) {
      throw new Error('The receiver did not confirm the volume change');
    }
  }
}

export const receiver = {
  key: DEVICE_TYPE,

  deviceExternalId(gladys) {
    return ids(gladys).device;
  },

  /** Discovery payload, or null while no address is configured. */
  buildDevice(gladys, config) {
    if (!config.host) {
      return null;
    }
    const featureIds = ids(gladys);
    const inputs = buildInputList(config.input_names);
    const common = { read_only: false, keep_history: false };
    return {
      name: model ? `Pioneer ${model.split('/')[0]}` : 'Pioneer receiver',
      external_id: featureIds.device,
      params: [{ name: 'IP_ADDRESS', value: config.host }],
      features: [
        {
          ...common,
          name: 'Power',
          external_id: featureIds.feature(FEATURE.POWER),
          category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
          type: DEVICE_FEATURE_TYPES.TELEVISION.BINARY,
          min: 0,
          max: 1,
          has_feedback: true,
          keep_history: true,
        },
        {
          ...common,
          name: 'Volume',
          external_id: featureIds.feature(FEATURE.VOLUME),
          category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
          type: DEVICE_FEATURE_TYPES.TELEVISION.VOLUME,
          unit: DEVICE_FEATURE_UNITS.DECIBEL,
          min: VOLUME_DB_MIN,
          max: Math.min(VOLUME_DB_MAX, config.max_volume_db),
          has_feedback: true,
        },
        {
          ...common,
          name: 'Mute',
          external_id: featureIds.feature(FEATURE.MUTE),
          category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
          type: DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_MUTE,
          min: 0,
          max: 1,
          has_feedback: true,
        },
        {
          ...common,
          name: 'Volume up',
          external_id: featureIds.feature(FEATURE.VOLUME_UP),
          category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
          type: DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_UP,
          min: 0,
          max: 1,
          has_feedback: false,
        },
        {
          ...common,
          name: 'Volume down',
          external_id: featureIds.feature(FEATURE.VOLUME_DOWN),
          category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
          type: DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_DOWN,
          min: 0,
          max: 1,
          has_feedback: false,
        },
        {
          ...common,
          name: 'Input',
          external_id: featureIds.feature(FEATURE.INPUT),
          category: DEVICE_FEATURE_CATEGORIES.TEXT,
          type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
          min: 0,
          max: 0,
          has_feedback: true,
          supported_options: inputs.map((input, index) => ({
            value: input.code,
            label: { en: input.name, fr: input.name },
            sort_order: index + 1,
          })),
        },
        {
          ...common,
          name: 'Listening mode',
          external_id: featureIds.feature(FEATURE.LISTENING_MODE),
          category: DEVICE_FEATURE_CATEGORIES.TEXT,
          type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
          min: 0,
          max: 0,
          // The receiver cannot report its listening mode: Gladys shows the
          // last mode it asked for.
          has_feedback: false,
          supported_options: LISTENING_MODES.map((mode, index) => ({
            value: mode.value,
            label: mode.label,
            sort_order: index + 1,
          })),
        },
      ],
    };
  },

  async onSetValue(gladys, { feature, value, config }) {
    const c = requireClient();
    const key = feature.external_id.slice(ids(gladys).feature('').length);
    switch (key) {
      case FEATURE.POWER:
        await c.send(Number(value) === 1 ? COMMANDS.powerOn : COMMANDS.powerOff, {
          expectPrefix: 'PWR',
          timeoutMs: 8_000,
        });
        return;
      case FEATURE.VOLUME:
        await setVolume(c, Number(value), config);
        return;
      case FEATURE.MUTE:
        await c.send(Number(value) === 1 ? COMMANDS.muteOn : COMMANDS.muteOff, {
          expectPrefix: 'MUT',
        });
        return;
      case FEATURE.VOLUME_UP:
        if (current.raw !== null && current.raw + 2 > dbToRaw(config.max_volume_db)) {
          throw new Error('Maximum volume reached');
        }
        await c.send(COMMANDS.volumeUp, { expectPrefix: 'VOL' });
        return;
      case FEATURE.VOLUME_DOWN:
        await c.send(COMMANDS.volumeDown, { expectPrefix: 'VOL' });
        return;
      case FEATURE.INPUT: {
        const code = normalizeInputCode(value?.text ?? value);
        if (!code) {
          throw new Error(`Invalid input code: ${JSON.stringify(value)}`);
        }
        await c.send(COMMANDS.selectInput(code), { expectPrefix: 'FN' });
        return;
      }
      case FEATURE.LISTENING_MODE: {
        const mode = LISTENING_MODES.find((m) => m.value === (value?.text ?? value));
        if (!mode) {
          throw new Error(`Unknown listening mode: ${JSON.stringify(value)}`);
        }
        await c.send(mode.command, { timeoutMs: 300 });
        await publish(gladys, FEATURE.LISTENING_MODE, { text: mode.value });
        return;
      }
      default:
        throw new Error(`Unknown feature ${feature.external_id}`);
    }
  },

  /**
   * Open (or reopen, when the address changed) the connection to the
   * receiver. Returns a cleanup function. `createConnection` is only passed
   * by the tests, to talk to a fake receiver.
   */
  startPush(gladys, config, { createConnection } = {}) {
    const key = `${config.host}:${config.port}`;
    if (!config.host) {
      receiver.stopPush();
      return () => {};
    }
    if (client && clientKey === key) {
      return () => receiver.stopPush();
    }
    receiver.stopPush();
    clientKey = key;
    // A new receiver address: forget everything learnt about the previous one.
    lastPublished.clear();
    Object.assign(current, { on: null, raw: null, muted: null, input: null });
    model = null;
    client = new PioneerClient({ host: config.host, port: config.port, logger, createConnection });
    client.on('state', (state) =>
      handleState(gladys, state).catch((err) => logger.error('Publishing a state failed', err)),
    );
    client.on('connected', async () => {
      logger.info(`Connected to the receiver at ${key}`);
      await gladys.setConnectionStatus(true).catch(() => {});
      try {
        const knownModel = model;
        await refreshAll(client);
        // The model name is used as device name: re-publish once it is known.
        if (model && model !== knownModel) {
          await gladys.publishDiscoveredDevices([receiver.buildDevice(gladys, config)]);
        }
      } catch (err) {
        logger.warn(`Reading the receiver state failed: ${err.message}`);
      }
    });
    client.on('disconnected', () => {
      gladys
        .setConnectionStatus(false, {
          en: `Receiver ${key} unreachable. Is Network Standby on?`,
          fr: `Ampli ${key} injoignable. Le Network Standby est-il activé ?`,
        })
        .catch(() => {});
    });
    client.start();
    return () => receiver.stopPush();
  },

  stopPush() {
    client?.stop();
    client = null;
    clientKey = '';
  },

  /** Send any command and return what the receiver answered (raw lines). */
  async sendRaw(command, timeoutMs = 1_500) {
    return requireClient().send(command, { timeoutMs });
  },

  status() {
    return { connected: Boolean(client?.connected), model, ...current };
  },
};
