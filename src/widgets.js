// -----------------------------------------------------------------------------
// Dashboard widget "remote" (Gladys 5.1+): the state of one receiver zone at a
// glance — power, volume, mute and current input. Display only: the controls
// (switch, volume slider, input list) are the device features, which Gladys
// renders itself in its standard "Devices" widget.
//
// Gladys renders the content from a fixed vocabulary (no HTML): this module
// only describes it. The volume tile is bound to the device feature, so it
// follows the receiver live; the other tiles are computed, and the widget
// asks Gladys to re-pull them when a state changes.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE, MAIN, receivers, routeOf } from './devices/receiver.js';
import { buildInputList } from './pioneer/protocol.js';

export const WIDGET_KEY = 'remote';

// Gladys refreshes a widget at most once every 10 s: changes in between are
// coalesced into one trailing refresh, so the last one is never lost.
const REFRESH_INTERVAL_MS = 10_500;

// Tile values are plain strings of 12 characters at most: they are localized
// here from the language Gladys sends with each request.
const TEXTS = {
  en: { on: 'On', standby: 'Standby', muted: 'Muted', sound: 'On' },
  fr: { on: 'Allumé', standby: 'Veille', muted: 'Coupé', sound: 'Actif' },
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

/** Build the widget content (pure: tested without Gladys). */
export function buildRemoteContent(gladys, target, config, language = 'en') {
  const t = TEXTS[language] ?? TEXTS.en;
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
  const power = values[FEATURE.POWER];
  const muted = values[FEATURE.MUTE];
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
      value: power === undefined ? '?' : power === 1 ? t.on : t.standby,
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
      label: { en: 'Sound', fr: 'Son' },
      value: muted === undefined ? '?' : muted === 1 ? t.muted : t.sound,
      icon: muted === 1 ? 'volume-x' : 'volume-2',
      color: muted === 1 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      label: { en: 'Input', fr: 'Source' },
      value: short(input?.name ?? inputCode ?? '?'),
      icon: 'log-in',
    },
  );
  return { ttl_seconds: 60, components };
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
    get: (gladys, { settings, language, config }) =>
      buildRemoteContent(gladys, resolveTarget(gladys, settings), config, language),
  },
};
