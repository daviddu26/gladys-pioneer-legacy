// -----------------------------------------------------------------------------
// Devices: legacy Pioneer AV RECEIVERS, any number of them.
//
// Each receiver is one Gladys device (main zone), plus a second device for
// zone 2 when the receiver has one. What a receiver supports is found once,
// at discovery (src/discovery.js), and stored in the device params, so the
// integration rebuilds the same devices after a restart without probing.
//
// One TCP connection per receiver, opened for the devices the user created.
// The receiver pushes its state on it, so Gladys gets every change made with
// the remote without polling; on each (re)connection the full state is read
// once, since changes made while the link was down were lost.
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
  decodeInputs,
  encodeInputs,
  listeningModeName,
  normalizeInputCode,
  rawToDb,
  zone2DbToRaw,
  zone2RawToDb,
} from '../pioneer/protocol.js';

const logger = createLogger({ name: 'receiver' });

// Device types and feature keys are stored by Gladys: never rename one.
export const MAIN = 'receiver';
export const ZONE2 = 'zone2';
export const ZONE3 = 'zone3';
const ALL_ZONES = [MAIN, ZONE2, ZONE3];
export const FEATURE = {
  POWER: 'power',
  VOLUME: 'volume',
  MUTE: 'mute',
  VOLUME_UP: 'volume-up',
  VOLUME_DOWN: 'volume-down',
  INPUT: 'input',
  LISTENING_MODE: 'listening-mode',
  CURRENT_LISTENING_MODE: 'current-listening-mode',
};
export const PARAM = {
  IP_ADDRESS: 'IP_ADDRESS',
  PORT: 'PORT',
  MODEL: 'MODEL',
  CAPABILITIES: 'CAPABILITIES',
  INPUTS: 'INPUTS',
};

// Safety net when stepping the volume towards a target (1 dB per step).
const MAX_VOLUME_STEPS = 100;

// Per zone: how to talk to it. The zone 2 volume has its own scale.
const ZONES = {
  [MAIN]: {
    power: [COMMANDS.powerOn, COMMANDS.powerOff, 'PWR'],
    mute: [COMMANDS.muteOn, COMMANDS.muteOff, 'MUT'],
    volume: [COMMANDS.volumeUp, COMMANDS.volumeDown, 'VOL'],
    volumeQuery: COMMANDS.volumeQuery,
    volumeMaxDb: VOLUME_DB_MAX,
    stepRaw: 2,
    toDb: rawToDb,
    toRaw: dbToRaw,
    selectInput: COMMANDS.selectInput,
    inputPrefix: 'FN',
    queries: [
      [COMMANDS.powerQuery, 'PWR'],
      [COMMANDS.volumeQuery, 'VOL'],
      [COMMANDS.muteQuery, 'MUT'],
      [COMMANDS.inputQuery, 'FN'],
    ],
  },
  [ZONE2]: {
    power: [COMMANDS.zone2PowerOn, COMMANDS.zone2PowerOff, 'APR'],
    mute: [COMMANDS.zone2MuteOn, COMMANDS.zone2MuteOff, 'Z2MUT'],
    volume: [COMMANDS.zone2VolumeUp, COMMANDS.zone2VolumeDown, 'ZV'],
    volumeQuery: COMMANDS.zone2VolumeQuery,
    volumeMaxDb: 0,
    stepRaw: 1,
    toDb: zone2RawToDb,
    toRaw: zone2DbToRaw,
    selectInput: COMMANDS.zone2SelectInput,
    inputPrefix: 'Z2F',
    queries: [
      [COMMANDS.zone2PowerQuery, 'APR'],
      [COMMANDS.zone2VolumeQuery, 'ZV'],
      [COMMANDS.zone2MuteQuery, 'Z2MUT'],
      [COMMANDS.zone2InputQuery, 'Z2F'],
    ],
  },
  [ZONE3]: {
    power: [COMMANDS.zone3PowerOn, COMMANDS.zone3PowerOff, 'BPR'],
    mute: [COMMANDS.zone3MuteOn, COMMANDS.zone3MuteOff, 'Z3MUT'],
    volume: [COMMANDS.zone3VolumeUp, COMMANDS.zone3VolumeDown, 'YV'],
    volumeQuery: COMMANDS.zone3VolumeQuery,
    volumeMaxDb: 0,
    stepRaw: 1,
    toDb: zone2RawToDb,
    toRaw: zone2DbToRaw,
    selectInput: COMMANDS.zone3SelectInput,
    inputPrefix: 'Z3F',
    queries: [
      [COMMANDS.zone3PowerQuery, 'BPR'],
      [COMMANDS.zone3VolumeQuery, 'YV'],
      [COMMANDS.zone3MuteQuery, 'Z3MUT'],
      [COMMANDS.zone3InputQuery, 'Z3F'],
    ],
  },
};

// Which zone and which feature each parsed line updates.
const STATE_TARGETS = {
  power: [MAIN, FEATURE.POWER],
  volume: [MAIN, FEATURE.VOLUME],
  mute: [MAIN, FEATURE.MUTE],
  input: [MAIN, FEATURE.INPUT],
  'zone2-power': [ZONE2, FEATURE.POWER],
  'zone2-volume': [ZONE2, FEATURE.VOLUME],
  'zone2-mute': [ZONE2, FEATURE.MUTE],
  'zone2-input': [ZONE2, FEATURE.INPUT],
  'zone3-power': [ZONE3, FEATURE.POWER],
  'zone3-volume': [ZONE3, FEATURE.VOLUME],
  'zone3-mute': [ZONE3, FEATURE.MUTE],
  'zone3-input': [ZONE3, FEATURE.INPUT],
  'listening-mode': [MAIN, FEATURE.CURRENT_LISTENING_MODE],
};

// ---------------------------------------------------------------------------
// Device payloads
// ---------------------------------------------------------------------------

export function paramsOf(device) {
  return Object.fromEntries((device.params ?? []).map((p) => [p.name, p.value]));
}

// Capabilities stored in a device param, e.g. "zone2,input-names".
const CAPABILITY_KEYS = {
  zone2: 'zone2',
  zone3: 'zone3',
  inputNames: 'input-names',
  listeningModeQuery: 'mode-query',
};

export function encodeCapabilities(capabilities = {}) {
  return Object.entries(CAPABILITY_KEYS)
    .filter(([name]) => capabilities[name])
    .map(([, key]) => key)
    .join(',');
}

export function decodeCapabilities(text = '') {
  const set = new Set(String(text).split(',').filter(Boolean));
  return Object.fromEntries(
    Object.entries(CAPABILITY_KEYS).map(([name, key]) => [name, set.has(key)]),
  );
}

function zoneFeatures(ids, zone, inputs, config, capabilities = {}) {
  const z = ZONES[zone];
  const tv = (key, name, type, extra = {}) => ({
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
    type,
    min: 0,
    max: 1,
    read_only: false,
    has_feedback: true,
    keep_history: false,
    ...extra,
  });
  const features = [
    tv(FEATURE.POWER, 'Power', DEVICE_FEATURE_TYPES.TELEVISION.BINARY, { keep_history: true }),
    tv(FEATURE.VOLUME, 'Volume', DEVICE_FEATURE_TYPES.TELEVISION.VOLUME, {
      unit: DEVICE_FEATURE_UNITS.DECIBEL,
      min: VOLUME_DB_MIN,
      max: Math.min(z.volumeMaxDb, config.max_volume_db),
    }),
    tv(FEATURE.MUTE, 'Mute', DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_MUTE),
    tv(FEATURE.VOLUME_UP, 'Volume up', DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_UP, {
      has_feedback: false,
    }),
    tv(FEATURE.VOLUME_DOWN, 'Volume down', DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_DOWN, {
      has_feedback: false,
    }),
    {
      name: 'Input',
      external_id: ids.feature(FEATURE.INPUT),
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
      min: 0,
      max: 0,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      supported_options: inputs.map((input, index) => ({
        value: input.code,
        label: input.name,
        sort_order: index + 1,
      })),
    },
  ];
  if (zone === MAIN) {
    features.push({
      name: 'Listening mode',
      external_id: ids.feature(FEATURE.LISTENING_MODE),
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
      min: 0,
      max: 0,
      read_only: false,
      // The receivers cannot report the listening mode GROUP: Gladys shows
      // the last mode it asked for.
      has_feedback: false,
      keep_history: false,
      supported_options: LISTENING_MODES.map((mode, index) => ({
        value: mode.value,
        label: mode.label,
        sort_order: index + 1,
      })),
    });
    if (capabilities.listeningModeQuery) {
      // Models answering ?S report the exact mode in use (e.g. EXTENDED
      // STEREO): shown as read-only text.
      features.push({
        name: 'Current listening mode',
        external_id: ids.feature(FEATURE.CURRENT_LISTENING_MODE),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: true,
        keep_history: false,
      });
    }
  }
  return features;
}

function defaultName(receiver) {
  if (receiver.friendlyName) {
    return receiver.friendlyName;
  }
  return receiver.model ? `Pioneer ${receiver.model.split('/')[0]}` : 'Pioneer receiver';
}

/**
 * Discovery payloads of one receiver (as found by src/discovery.js, or as
 * rebuilt from stored params): the main zone, plus zone 2 when the receiver
 * answered the zone 2 / zone 3 queries.
 */
export function buildReceiverDevices(gladys, receiver, config) {
  const inputs = buildInputList(receiver.inputs, config.input_names);
  const label = defaultName(receiver);
  const params = [
    { name: PARAM.IP_ADDRESS, value: receiver.host },
    { name: PARAM.PORT, value: String(receiver.port) },
    { name: PARAM.MODEL, value: receiver.model ?? '' },
    { name: PARAM.CAPABILITIES, value: encodeCapabilities(receiver.capabilities) },
    { name: PARAM.INPUTS, value: encodeInputs(receiver.inputs ?? []) },
  ];
  const devices = [];
  for (const zone of ALL_ZONES) {
    if (zone !== MAIN && !receiver.capabilities?.[zone]) {
      continue;
    }
    const ids = gladys.externalIds(zone, receiver.platformId);
    devices.push({
      name: zone === MAIN ? label : `${label} (${zone === ZONE2 ? 'zone 2' : 'zone 3'})`,
      external_id: ids.device,
      params,
      features: zoneFeatures(ids, zone, inputs, config, receiver.capabilities),
    });
  }
  return devices;
}

/**
 * Which zone and receiver a device external id belongs to:
 * { zone, platformId } or null for a device this integration does not know.
 */
export function routeOf(gladys, device) {
  for (const zone of ALL_ZONES) {
    const prefix = gladys.externalIds(zone, '').device;
    if (device.external_id.startsWith(prefix)) {
      return { zone, platformId: device.external_id.slice(prefix.length) };
    }
  }
  return null;
}

/**
 * The receivers described by the devices the user created (their params),
 * one entry per receiver whatever its number of zones.
 */
export function receiversFromDevices(gladys, devices) {
  const byPlatform = new Map();
  for (const device of devices) {
    const route = routeOf(gladys, device);
    const params = paramsOf(device);
    if (!route || !params[PARAM.IP_ADDRESS]) {
      continue;
    }
    const entry = byPlatform.get(route.platformId) ?? {
      platformId: route.platformId,
      host: params[PARAM.IP_ADDRESS],
      port: Number(params[PARAM.PORT]) || 8102,
      model: params[PARAM.MODEL] || null,
      capabilities: decodeCapabilities(params[PARAM.CAPABILITIES]),
      inputs: decodeInputs(params[PARAM.INPUTS]),
      zones: new Set(),
    };
    entry.zones.add(route.zone);
    byPlatform.set(route.platformId, entry);
  }
  return [...byPlatform.values()];
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

class ReceiverConnection {
  constructor(gladys, { platformId, host, port }, { createConnection } = {}) {
    this.gladys = gladys;
    this.platformId = platformId;
    this.host = host;
    this.port = port;
    this.zones = new Set();
    this.raw = { [MAIN]: null, [ZONE2]: null, [ZONE3]: null };
    this.capabilities = {};
    this.inputs = [];
    // Last value published per zone and feature, read by the dashboard widget.
    this.values = { [MAIN]: {}, [ZONE2]: {}, [ZONE3]: {} };
    this.model = null;
    this.lastPublished = new Map();
    this.client = new PioneerClient({ host, port, logger, createConnection });
    this.client.on('state', (state) =>
      this.onState(state).catch((err) => logger.error('Publishing a state failed', err)),
    );
    this.client.on('connected', () => {
      statusListener?.();
      this.onConnected();
    });
    this.client.on('disconnected', () => {
      logger.warn(`Receiver ${this.key} disconnected`);
      statusListener?.();
    });
  }

  get key() {
    return `${this.host}:${this.port}`;
  }

  get connected() {
    return this.client.connected;
  }

  featureId(zone, key) {
    return this.gladys.externalIds(zone, this.platformId).feature(key);
  }

  async publish(zone, key, value) {
    if (!this.zones.has(zone)) {
      return;
    }
    const id = this.featureId(zone, key);
    const comparable = JSON.stringify(value);
    if (this.lastPublished.get(id) === comparable) {
      return;
    }
    this.lastPublished.set(id, comparable);
    this.values[zone][key] = value;
    stateListener?.(this);
    await this.gladys.publishState(id, value);
  }

  async onState(state) {
    if (state.type === 'model') {
      this.model = state.model;
      return;
    }
    const target = STATE_TARGETS[state.type];
    if (!target) {
      return;
    }
    const [zone, key] = target;
    let value;
    if (key === FEATURE.POWER) {
      value = state.on ? 1 : 0;
    } else if (key === FEATURE.MUTE) {
      value = state.muted ? 1 : 0;
    } else if (key === FEATURE.VOLUME) {
      this.raw[zone] = state.raw;
      value = ZONES[zone].toDb(state.raw);
    } else if (key === FEATURE.CURRENT_LISTENING_MODE) {
      if (!this.capabilities.listeningModeQuery) {
        return;
      }
      value = { text: listeningModeName(state.code) };
    } else {
      value = { text: state.code };
    }
    await this.publish(zone, key, value);
  }

  async onConnected() {
    logger.info(`Connected to the receiver at ${this.key}`);
    this.lastPublished.clear();
    try {
      for (const zone of this.zones) {
        for (const [command, prefix] of ZONES[zone].queries) {
          await this.client.send(command, { expectPrefix: prefix });
        }
      }
      if (this.capabilities.listeningModeQuery) {
        await this.client.send(COMMANDS.listeningModeQuery, { expectPrefix: 'SR' });
      }
      await this.client.send(COMMANDS.modelQuery, { expectPrefix: 'RGD', timeoutMs: 3_000 });
    } catch (err) {
      logger.warn(`Reading the state of ${this.key} failed: ${err.message}`);
    }
  }

  requireConnected() {
    if (!this.client.connected) {
      throw new Error(`Receiver ${this.key} is not connected. Is Network Standby on?`);
    }
  }

  async setVolume(zone, targetDb, config) {
    const z = ZONES[zone];
    const [up, down, prefix] = z.volume;
    const target = z.toRaw(Math.min(targetDb, config.max_volume_db, z.volumeMaxDb));
    if (this.raw[zone] === null) {
      await this.client.send(z.volumeQuery, { expectPrefix: prefix });
    }
    for (let step = 0; step < MAX_VOLUME_STEPS; step += 1) {
      const raw = this.raw[zone];
      if (raw === null || Math.abs(raw - target) < z.stepRaw) {
        return;
      }
      const answer = await this.client.send(raw < target ? up : down, { expectPrefix: prefix });
      if (answer === null) {
        throw new Error('The receiver did not confirm the volume change');
      }
    }
  }

  async setValue(zone, key, value, config) {
    this.requireConnected();
    const z = ZONES[zone];
    const c = this.client;
    switch (key) {
      case FEATURE.POWER: {
        const [on, off, prefix] = z.power;
        await c.send(Number(value) === 1 ? on : off, { expectPrefix: prefix, timeoutMs: 8_000 });
        return;
      }
      case FEATURE.VOLUME:
        await this.setVolume(zone, Number(value), config);
        return;
      case FEATURE.MUTE: {
        const [on, off, prefix] = z.mute;
        await c.send(Number(value) === 1 ? on : off, { expectPrefix: prefix });
        return;
      }
      case FEATURE.VOLUME_UP: {
        const max = z.toRaw(Math.min(config.max_volume_db, z.volumeMaxDb));
        if (this.raw[zone] !== null && this.raw[zone] + z.stepRaw > max) {
          throw new Error('Maximum volume reached');
        }
        await c.send(z.volume[0], { expectPrefix: z.volume[2] });
        return;
      }
      case FEATURE.VOLUME_DOWN:
        await c.send(z.volume[1], { expectPrefix: z.volume[2] });
        return;
      case FEATURE.INPUT: {
        const code = normalizeInputCode(value?.text ?? value);
        if (!code) {
          throw new Error(`Invalid input code: ${JSON.stringify(value)}`);
        }
        await c.send(z.selectInput(code), { expectPrefix: z.inputPrefix });
        return;
      }
      case FEATURE.LISTENING_MODE: {
        const mode = LISTENING_MODES.find((m) => m.value === (value?.text ?? value));
        if (!mode) {
          throw new Error(`Unknown listening mode: ${JSON.stringify(value)}`);
        }
        await c.send(mode.command, { timeoutMs: 300 });
        await this.publish(MAIN, FEATURE.LISTENING_MODE, { text: mode.value });
        if (this.capabilities.listeningModeQuery) {
          // A group code does not always make the receiver push the new mode.
          await c.send(COMMANDS.listeningModeQuery, { expectPrefix: 'SR' });
        }
        return;
      }
      default:
        throw new Error(`Unknown feature "${key}"`);
    }
  }
}

// Open connections, by platform id.
const connections = new Map();
// Called whenever a receiver connects or disconnects (see index.js).
let statusListener = null;
// Called whenever a published state changes (see the dashboard widget).
let stateListener = null;

export const receivers = {
  /**
   * Open a connection for every receiver the user created, close the others,
   * and reopen one whose address changed (DHCP, edited params...).
   * `options.createConnection` is only passed by the tests.
   */
  sync(gladys, createdDevices, options = {}) {
    const wanted = new Map(
      receiversFromDevices(gladys, createdDevices).map((r) => [r.platformId, r]),
    );
    for (const [platformId, connection] of connections) {
      const want = wanted.get(platformId);
      if (!want || want.host !== connection.host || want.port !== connection.port) {
        connection.client.stop();
        connections.delete(platformId);
      }
    }
    for (const [platformId, want] of wanted) {
      let connection = connections.get(platformId);
      if (!connection) {
        connection = new ReceiverConnection(gladys, want, options);
        connection.zones = want.zones;
        connection.capabilities = want.capabilities;
        connection.inputs = want.inputs;
        connections.set(platformId, connection);
        connection.client.start();
      } else {
        connection.zones = want.zones;
        connection.capabilities = want.capabilities;
        connection.inputs = want.inputs;
      }
    }
  },

  onStatusChange(listener) {
    statusListener = listener;
  },

  onStateChange(listener) {
    stateListener = listener;
  },

  stopAll() {
    for (const connection of connections.values()) {
      connection.client.stop();
    }
    connections.clear();
  },

  /** Route a Gladys command to the right receiver and zone. */
  async onSetValue(gladys, { device, feature, value, config }) {
    const route = routeOf(gladys, device);
    const connection = route && connections.get(route.platformId);
    if (!connection) {
      throw new Error(`No receiver connection for ${device.external_id}`);
    }
    const prefix = gladys.externalIds(route.zone, route.platformId).feature('');
    await connection.setValue(route.zone, feature.external_id.slice(prefix.length), value, config);
  },

  /** The connection of one receiver by platform id, or the only one. */
  find(platformId) {
    if (platformId) {
      return connections.get(platformId) ?? null;
    }
    return connections.size === 1 ? [...connections.values()][0] : null;
  },

  list() {
    return [...connections.values()];
  },
};
