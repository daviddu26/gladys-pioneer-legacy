// -----------------------------------------------------------------------------
// Dashboard widget "remote" (Gladys 5.1+): a compact remote for one receiver
// zone. Tiles show power, volume, input and listening mode; four buttons
// switch it on or off, step the volume and toggle the listening mode (main
// zone) or the mute (zones 2 and 3).
//
// Gladys renders the content itself from a fixed vocabulary (no HTML): this
// module only describes it. The volume tile is bound to the device feature,
// so it follows the receiver live; the other tiles are computed, and the
// widget asks Gladys to re-pull them when a state changes.
// -----------------------------------------------------------------------------

import { WIDGET_BUTTON_STYLES, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE, MAIN, receivers, routeOf } from './devices/receiver.js';
import { LISTENING_MODES, buildInputList } from './pioneer/protocol.js';

export const WIDGET_KEY = 'remote';

// Gladys refreshes a widget at most once every 10 s: changes in between are
// coalesced into one trailing refresh, so the last one is never lost.
const REFRESH_INTERVAL_MS = 10_500;

// Tile values hold 12 characters at most.
const SHORT_MODE_NAMES = {
  auto_surround: 'AUTO SURR.',
  auto_direct: 'AUTO/DIRECT',
  stereo: 'STEREO',
  standard: 'STANDARD',
  advanced: 'ADVANCED',
};

const short = (text) => (text.length > 12 ? `${text.slice(0, 11)}…` : text);

/** The connection and zone a widget instance points at. */
export function resolveTarget(gladys, settings = {}) {
  if (settings.receiver) {
    const route = routeOf(gladys, { external_id: settings.receiver });
    const connection = route && receivers.find(route.platformId);
    return connection ? { connection, zone: route.zone } : null;
  }
  const connection = receivers.find();
  return connection ? { connection, zone: MAIN } : null;
}

/** The listening mode the toggle button switches to. */
function nextMode(values) {
  const last = values[FEATURE.LISTENING_MODE]?.text;
  const current = values[FEATURE.CURRENT_LISTENING_MODE]?.text;
  if (last === 'advanced' || (!last && current && !current.startsWith('AUTO'))) {
    return 'auto_surround';
  }
  return 'advanced';
}

/** Build the widget content (pure: tested without Gladys). */
export function buildRemoteContent(gladys, target, config) {
  if (!target) {
    return {
      ttl_seconds: 60,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'No receiver yet: add one from the Discovery tab of the integration.',
            fr: "Aucun ampli : ajoutez-en un depuis l'onglet Découverte de l'intégration.",
          },
        },
      ],
    };
  }
  const { connection, zone } = target;
  const values = connection.values[zone];
  const ids = gladys.externalIds(zone, connection.platformId);
  const receiver = ids.device;
  const power = values[FEATURE.POWER];
  const inputCode = values[FEATURE.INPUT]?.text;
  const input = buildInputList(connection.inputs, config.input_names).find(
    (i) => i.code === inputCode,
  );

  const components = [];
  if (!connection.connected) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: {
        en: 'Receiver unreachable. Is Network Standby on?',
        fr: 'Ampli injoignable. Le Network Standby est-il activé ?',
      },
    });
  }
  components.push(
    {
      type: 'value',
      label: { en: 'Power', fr: 'Alimentation' },
      value: power === undefined ? '?' : power === 1 ? 'ON' : 'STANDBY',
      icon: 'power',
      color: power === 1 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      label: { en: 'Volume', fr: 'Volume' },
      device_feature: ids.feature(FEATURE.VOLUME),
      icon: 'volume-2',
    },
    {
      type: 'value',
      label: { en: 'Input', fr: 'Entrée' },
      value: short(input?.name ?? inputCode ?? '?'),
      icon: 'log-in',
    },
  );

  if (zone === MAIN) {
    const current = values[FEATURE.CURRENT_LISTENING_MODE]?.text;
    const last = values[FEATURE.LISTENING_MODE]?.text;
    components.push({
      type: 'value',
      label: { en: 'Mode', fr: 'Mode' },
      value: short(current ?? SHORT_MODE_NAMES[last] ?? '?'),
      icon: 'sliders',
    });
  }

  components.push(
    {
      type: 'button',
      label: power === 1 ? { en: 'Turn off', fr: 'Éteindre' } : { en: 'Turn on', fr: 'Allumer' },
      icon: 'power',
      style: power === 1 ? WIDGET_BUTTON_STYLES.SECONDARY : WIDGET_BUTTON_STYLES.PRIMARY,
      action: { key: 'power', params: { receiver, on: power === 1 ? 0 : 1 } },
    },
    {
      type: 'button',
      label: { en: 'Vol −', fr: 'Vol −' },
      icon: 'volume-1',
      style: WIDGET_BUTTON_STYLES.SECONDARY,
      device_feature: ids.feature(FEATURE.VOLUME_DOWN),
      value: 1,
    },
    {
      type: 'button',
      label: { en: 'Vol +', fr: 'Vol +' },
      icon: 'volume-2',
      style: WIDGET_BUTTON_STYLES.SECONDARY,
      device_feature: ids.feature(FEATURE.VOLUME_UP),
      value: 1,
    },
  );

  if (zone === MAIN) {
    const mode = nextMode(values);
    components.push({
      type: 'button',
      label: mode === 'advanced' ? 'ADVANCED' : 'AUTO SURROUND',
      icon: 'sliders',
      style: WIDGET_BUTTON_STYLES.SECONDARY,
      action: { key: 'mode', params: { receiver, mode } },
    });
  } else {
    const muted = values[FEATURE.MUTE] === 1;
    components.push({
      type: 'button',
      label: muted ? { en: 'Unmute', fr: 'Son' } : { en: 'Mute', fr: 'Muet' },
      icon: muted ? 'volume-2' : 'volume-x',
      style: WIDGET_BUTTON_STYLES.SECONDARY,
      action: { key: 'mute', params: { receiver, muted: muted ? 0 : 1 } },
    });
  }

  return { ttl_seconds: 60, components };
}

/** Run a button of the widget. */
export async function runRemoteAction(gladys, { actionKey, params, config }) {
  const target = resolveTarget(gladys, { receiver: params.receiver });
  if (!target) {
    throw new Error('This receiver is not connected.');
  }
  const { connection, zone } = target;
  if (actionKey === 'power') {
    await connection.setValue(zone, FEATURE.POWER, params.on, config);
    return params.on === 1
      ? { en: 'Receiver on', fr: 'Ampli allumé' }
      : { en: 'Receiver in standby', fr: 'Ampli en veille' };
  }
  if (actionKey === 'mode') {
    const mode = LISTENING_MODES.find((m) => m.value === params.mode);
    if (!mode) {
      throw new Error(`Unknown listening mode: ${params.mode}`);
    }
    await connection.setValue(MAIN, FEATURE.LISTENING_MODE, mode.value, config);
    return mode.label;
  }
  if (actionKey === 'mute') {
    await connection.setValue(zone, FEATURE.MUTE, params.muted, config);
    return params.muted === 1
      ? { en: 'Muted', fr: 'Son coupé' }
      : { en: 'Unmuted', fr: 'Son remis' };
  }
  throw new Error(`Unknown widget action: ${actionKey}`);
}

/**
 * Ask Gladys to re-pull the widget after a state change, coalesced so the
 * rate limit never drops the last change.
 */
export function createRefresher(gladys, intervalMs = REFRESH_INTERVAL_MS) {
  let lastRun = 0;
  let timer = null;
  return () => {
    if (timer) {
      return;
    }
    const wait = Math.max(0, lastRun + intervalMs - Date.now());
    timer = setTimeout(() => {
      timer = null;
      lastRun = Date.now();
      gladys.requestWidgetRefresh(WIDGET_KEY);
    }, wait);
    timer.unref?.();
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (gladys, { settings, config }) =>
      buildRemoteContent(gladys, resolveTarget(gladys, settings), config),
    action: (gladys, { actionKey, params, config }) =>
      runRemoteAction(gladys, { actionKey, params, config }),
  },
};
