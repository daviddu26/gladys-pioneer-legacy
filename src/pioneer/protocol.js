// -----------------------------------------------------------------------------
// Legacy Pioneer IP protocol (receivers from about 2010 to 2015, port 8102).
//
// Plain ASCII over TCP: every command and every answer is one line ended by CR
// (answers may come with CRLF). The receiver also pushes, without being asked,
// every state change (volume turned with the remote, input switched on the
// front panel...) and a lone "R" about every 30 s to say it is alive.
//
// Facts measured on a VSX-528 (2013), kept here because they shape the code:
//   - an unknown command gets NO error code, just silence: a command can never
//     be "confirmed failed", only "not confirmed";
//   - the receiver reads only the start of a command ("?PQ" is answered as
//     "?P"): an answer must be matched on the prefix we expect, never on "the
//     next line";
//   - standby is reported as PWR2 (other models answer PWR1);
//   - one VU/VD press moves the volume by 2 units, i.e. 1 dB;
//   - listening modes can be set with the "group" codes only (0100SR recalls
//     the last mode of the advanced group, 0006SR selects auto surround), and
//     the current mode cannot be read back.
//
// This file is pure (no I/O) so the tests can cover it without a receiver.
// -----------------------------------------------------------------------------

// Raw volume scale: 0 is muted ("---"), 1 is -80 dB, 161 is 0 dB, 185 is +12 dB.
export const VOLUME_RAW_MAX = 185;
const VOLUME_RAW_ZERO_DB = 161;
export const VOLUME_DB_MIN = -80;
export const VOLUME_DB_MAX = 12;

/** Raw receiver volume (0-185) -> decibels, rounded to the half dB. */
export function rawToDb(raw) {
  if (raw <= 0) {
    return VOLUME_DB_MIN;
  }
  return (raw - VOLUME_RAW_ZERO_DB) / 2;
}

/** Decibels -> raw receiver volume, clamped to the valid range. */
export function dbToRaw(db) {
  const raw = Math.round(VOLUME_RAW_ZERO_DB + db * 2);
  return Math.min(VOLUME_RAW_MAX, Math.max(1, raw));
}

// Input codes found on a VSX-528 by cycling with FU. The receiver cannot tell
// their names over IP (the ?RGBxx query is not supported), so these are the
// usual Pioneer names for each code; the user can rename them in the config.
export const DEFAULT_INPUTS = [
  { code: '25', name: 'BD' },
  { code: '04', name: 'DVD' },
  { code: '06', name: 'SAT/CBL' },
  { code: '15', name: 'DVR/BDR' },
  { code: '05', name: 'TV' },
  { code: '49', name: 'GAME' },
  { code: '48', name: 'MHL' },
  { code: '01', name: 'CD' },
  { code: '02', name: 'TUNER' },
  { code: '17', name: 'iPod/USB' },
  { code: '33', name: 'ADAPTER PORT' },
  { code: '38', name: 'INTERNET RADIO' },
  { code: '53', name: 'SPOTIFY' },
  { code: '44', name: 'MEDIA SERVER' },
  { code: '45', name: 'FAVORITES' },
];

// Listening modes that can be SET on these models. Values are stable keys
// stored by Gladys in scenes: never rename one.
export const LISTENING_MODES = [
  {
    value: 'auto_surround',
    command: '0006SR',
    label: { en: 'Auto surround', fr: 'Auto surround' },
  },
  {
    value: 'advanced',
    command: '0100SR',
    label: {
      en: 'Advanced (last used, e.g. EXT.STEREO)',
      fr: 'Advanced (dernier utilisé, ex. EXT.STEREO)',
    },
  },
];

export const COMMANDS = {
  powerOn: 'PO',
  powerOff: 'PF',
  powerQuery: '?P',
  volumeUp: 'VU',
  volumeDown: 'VD',
  volumeQuery: '?V',
  muteOn: 'MO',
  muteOff: 'MF',
  muteQuery: '?M',
  inputQuery: '?F',
  modelQuery: '?RGD',
  /** Select an input by its two-digit code, e.g. "25FN". */
  selectInput: (code) => `${code}FN`,
};

/**
 * Validate a free-form command typed by a user (scene action, test button):
 * printable ASCII only, so nothing can inject a line break into the stream.
 */
export function isSafeCommand(command) {
  return typeof command === 'string' && /^[\x20-\x7E]{1,32}$/.test(command);
}

/** Normalize an input code typed by a user ("5" -> "05"). */
export function normalizeInputCode(code) {
  const digits = String(code ?? '').trim();
  if (!/^\d{1,2}$/.test(digits)) {
    return null;
  }
  return digits.padStart(2, '0');
}

/**
 * Parse one line received from the receiver into a state change.
 * Returns null for lines that carry no state (the "R" heartbeat, unknown
 * answers): the caller just ignores them.
 */
export function parseLine(rawLine) {
  const line = String(rawLine).trim();
  if (line === '' || line === 'R') {
    return null;
  }
  let match = line.match(/^PWR(\d)$/);
  if (match) {
    // PWR0 = on; PWR1 or PWR2 = standby depending on the model.
    return { type: 'power', on: match[1] === '0' };
  }
  match = line.match(/^VOL(\d{3})$/);
  if (match) {
    return { type: 'volume', raw: Number(match[1]) };
  }
  match = line.match(/^MUT(\d)$/);
  if (match) {
    // Beware the inversion: MUT0 means "muted".
    return { type: 'mute', muted: match[1] === '0' };
  }
  match = line.match(/^FN(\d{2})$/);
  if (match) {
    return { type: 'input', code: match[1] };
  }
  match = line.match(/^RGD<[^>]*><([^>]*)>$/);
  if (match) {
    return { type: 'model', model: match[1].trim() };
  }
  return { type: 'unknown', line };
}

/**
 * Split a TCP chunk into complete lines, keeping the unfinished tail for the
 * next chunk. Accepts CR, LF or CRLF line ends.
 */
export function splitLines(buffer) {
  const parts = buffer.split(/\r\n|\r|\n/);
  const rest = parts.pop();
  return { lines: parts.filter((l) => l.trim() !== ''), rest };
}

/**
 * Parse the user's input names setting, one "code=name" pair per line or
 * separated by commas, e.g. "25=Apple TV, 05=TV". Pairs override the defaults;
 * unknown codes are added. Malformed pairs are ignored.
 */
export function buildInputList(customNames = '') {
  const inputs = DEFAULT_INPUTS.map((i) => ({ ...i }));
  for (const pair of String(customNames).split(/[\n,;]/)) {
    const [codePart, ...nameParts] = pair.split('=');
    const code = normalizeInputCode(codePart);
    const name = nameParts.join('=').trim();
    if (!code || !name) {
      continue;
    }
    const existing = inputs.find((i) => i.code === code);
    if (existing) {
      existing.name = name;
    } else {
      inputs.push({ code, name });
    }
  }
  return inputs;
}
