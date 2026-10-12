// -----------------------------------------------------------------------------
// Legacy Pioneer IP protocol (receivers from about 2009 to 2015, port 8102 or
// 23). Recent Pioneers (2016+) speak Onkyo's eISCP instead (port 60128).
//
// Sources: Pioneer's official "AVR IP & RS-232" command sheets (FY13 and the
// "2015 Pioneer & Elite AVR External Command" document). Pioneer no longer
// hosts them; the codes below were cross-checked against implementations
// built from them (openHAB pioneeravr binding, aiopioneer) and against a real
// VSX-528.
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
//     the current mode cannot be read back (?S answers nothing);
//   - input names cannot be read (?RGBxx answers nothing), nor zone 2.
// Bigger models of the same generation (VSX-9xx/10xx, SC-LX...) answer more
// queries: the integration probes them once and only exposes what answers.
//
// This file is pure (no I/O) so the tests can cover it without a receiver.
// -----------------------------------------------------------------------------

// Main zone raw volume: 0 is muted ("---"), 1 is -80 dB, 161 is 0 dB, 185 is
// +12 dB.
export const VOLUME_RAW_MAX = 185;
const VOLUME_RAW_ZERO_DB = 161;
export const VOLUME_DB_MIN = -80;
export const VOLUME_DB_MAX = 12;

// Zone 2 and zone 3 raw volume: 00 is muted, 01 is -80 dB, 81 is 0 dB, 1 dB
// per unit.
export const ZONE2_RAW_MAX = 81;

/** Main zone raw volume (0-185) -> decibels, in half dB. */
export function rawToDb(raw) {
  if (raw <= 0) {
    return VOLUME_DB_MIN;
  }
  return (raw - VOLUME_RAW_ZERO_DB) / 2;
}

/** Decibels -> main zone raw volume, clamped to the valid range. */
export function dbToRaw(db) {
  const raw = Math.round(VOLUME_RAW_ZERO_DB + db * 2);
  return Math.min(VOLUME_RAW_MAX, Math.max(1, raw));
}

/**
 * Raw volume -> percent of the zone's scale (0-185 main, 0-81 zones 2/3).
 * Gladys shows the volume as 0-100 %: easier to read than decibels, and
 * the same for every zone and every model.
 */
export function rawToPercent(raw, rawMax) {
  return Math.round((Math.min(Math.max(raw, 0), rawMax) / rawMax) * 100);
}

/** Percent -> raw volume of the zone's scale, clamped to the valid range. */
export function percentToRaw(percent, rawMax) {
  const clamped = Math.min(Math.max(Number(percent) || 0, 0), 100);
  return Math.round((clamped / 100) * rawMax);
}

/** Zone 2/3 raw volume (0-81) -> decibels. */
export function zone2RawToDb(raw) {
  return raw <= 0 ? VOLUME_DB_MIN : raw - ZONE2_RAW_MAX;
}

/** Decibels -> zone 2/3 raw volume, clamped to the valid range. */
export function zone2DbToRaw(db) {
  return Math.min(ZONE2_RAW_MAX, Math.max(1, Math.round(db + ZONE2_RAW_MAX)));
}

// Usual Pioneer input codes of this generation and their factory names. A
// model only has some of them: the ones found on a VSX-528 come first. When
// the receiver can report its own names (?RGBxx), they replace this list.
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

// Input codes probed for their names on the models that support ?RGBxx.
export const PROBED_INPUT_CODES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// Listening modes the user can pick. The official sheets list two kinds of
// SR codes: "cyclic" group codes, the same buttons as on the remote, accepted
// by every model of this generation; and direct mode codes (e.g. 0112 for
// EXTENDED STEREO), which entry-level models such as the VSX-528 ignore.
// Only group codes and AUTO SURROUND are offered, so the list works
// everywhere; any direct code can still be sent with the "Send a command"
// action. Values are stable keys stored by Gladys in scenes: never rename one.
// Labels are plain strings (the Gladys core refuses multi-language option
// labels), written like the receiver's own display so they read the same in
// every language.
export const LISTENING_MODES = [
  { value: 'auto_surround', command: '0006SR', label: 'AUTO SURROUND' },
  { value: 'auto_direct', command: '0005SR', label: 'AUTO SURR / DIRECT (cycle)' },
  { value: 'stereo', command: '0001SR', label: 'STEREO (cycle)' },
  { value: 'standard', command: '0010SR', label: 'STANDARD (cycle)' },
  {
    value: 'advanced',
    command: '0100SR',
    label: 'ADVANCED SURROUND (last used, e.g. EXT.STEREO)',
  },
];

// Names of the listening mode codes reported by ?S (SRnnnn), from the
// official sheets. Only the models that answer ?S get the "current listening
// mode" feature; an unknown code is shown as its number.
export const LISTENING_MODE_NAMES = {
  '0001': 'STEREO',
  '0003': 'FRONT STAGE SURROUND ADVANCE',
  '0004': 'FRONT STAGE SURROUND ADVANCE WIDE',
  '0005': 'AUTO SURR/STREAM DIRECT',
  '0006': 'AUTO SURROUND',
  '0007': 'DIRECT',
  '0008': 'PURE DIRECT',
  '0009': 'STEREO',
  '0010': 'STANDARD',
  '0011': '2ch',
  '0012': 'PRO LOGIC',
  '0013': 'PRO LOGIC2 MOVIE',
  '0014': 'PRO LOGIC2 MUSIC',
  '0015': 'PRO LOGIC2 GAME',
  '0016': 'Neo:6 CINEMA',
  '0017': 'Neo:6 MUSIC',
  '0018': 'PRO LOGIC2x MOVIE',
  '0019': 'PRO LOGIC2x MUSIC',
  '0020': 'PRO LOGIC2x GAME',
  '0021': 'Multi ch',
  '0022': 'DOLBY EX',
  '0025': 'DTS-ES Neo',
  '0026': 'DTS-ES matrix',
  '0027': 'DTS-ES discrete',
  '0029': 'NEURAL SURROUND',
  '0031': 'PRO LOGIC2z HEIGHT',
  '0032': 'WIDE SURROUND MOVIE',
  '0033': 'WIDE SURROUND MUSIC',
  '0037': 'Neo:X CINEMA',
  '0038': 'Neo:X MUSIC',
  '0039': 'Neo:X GAME',
  '0101': 'ACTION',
  '0102': 'SCI-FI',
  '0103': 'DRAMA',
  '0104': 'ENTERTAINMENT SHOW',
  '0105': 'MONO FILM',
  '0106': 'EXPANDED THEATER',
  '0107': 'CLASSICAL',
  '0109': 'UNPLUGGED',
  '0110': 'ROCK/POP',
  '0112': 'EXTENDED STEREO',
  '0113': 'PHONES SURROUND',
  '0116': 'TV SURROUND',
  '0117': 'SPORTS',
  '0118': 'ADVANCED GAME',
  '0151': 'AUTO LEVEL CONTROL',
  '0152': 'OPTIMUM SURROUND',
  '0153': 'RETRIEVER AIR',
  '0200': 'ECO MODE',
  '0212': 'ECO MODE 1',
  '0213': 'ECO MODE 2',
};

/** Display name of a listening mode code reported by the receiver. */
export function listeningModeName(code) {
  return LISTENING_MODE_NAMES[code] ?? `MODE ${code}`;
}

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
  inputNameQuery: (code) => `?RGB${code}`,
  zone2PowerOn: 'APO',
  zone2PowerOff: 'APF',
  zone2PowerQuery: '?AP',
  zone2VolumeUp: 'ZU',
  zone2VolumeDown: 'ZD',
  zone2VolumeQuery: '?ZV',
  zone2MuteOn: 'Z2MO',
  zone2MuteOff: 'Z2MF',
  zone2MuteQuery: '?Z2M',
  zone2InputQuery: '?ZS',
  zone2SelectInput: (code) => `${code}ZS`,
  zone3PowerOn: 'BPO',
  zone3PowerOff: 'BPF',
  zone3PowerQuery: '?BP',
  zone3VolumeUp: 'YU',
  zone3VolumeDown: 'YD',
  zone3VolumeQuery: '?YV',
  zone3MuteOn: 'Z3MO',
  zone3MuteOff: 'Z3MF',
  zone3MuteQuery: '?Z3M',
  zone3InputQuery: '?ZT',
  zone3SelectInput: (code) => `${code}ZT`,
  listeningModeQuery: '?S',
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

// Line patterns, most specific first: "Z2MUT0" must not be read as "MUT0".
const PATTERNS = [
  [/^PWR(\d)$/, (m) => ({ type: 'power', on: m[1] === '0' })],
  [/^VOL(\d{3})$/, (m) => ({ type: 'volume', raw: Number(m[1]) })],
  // Beware the inversion: MUT0 means "muted".
  [/^MUT(\d)$/, (m) => ({ type: 'mute', muted: m[1] === '0' })],
  [/^FN(\d{2})$/, (m) => ({ type: 'input', code: m[1] })],
  [/^SR(\d{4})$/, (m) => ({ type: 'listening-mode', code: m[1] })],
  [/^APR(\d)$/, (m) => ({ type: 'zone2-power', on: m[1] === '0' })],
  [/^ZV(\d{2})$/, (m) => ({ type: 'zone2-volume', raw: Number(m[1]) })],
  [/^Z2MUT(\d)$/, (m) => ({ type: 'zone2-mute', muted: m[1] === '0' })],
  [/^Z2F(\d{2})$/, (m) => ({ type: 'zone2-input', code: m[1] })],
  [/^BPR(\d)$/, (m) => ({ type: 'zone3-power', on: m[1] === '0' })],
  [/^YV(\d{2})$/, (m) => ({ type: 'zone3-volume', raw: Number(m[1]) })],
  [/^Z3MUT(\d)$/, (m) => ({ type: 'zone3-mute', muted: m[1] === '0' })],
  [/^Z3F(\d{2})$/, (m) => ({ type: 'zone3-input', code: m[1] })],
  [/^RGD<[^>]*><([^>]*)>$/, (m) => ({ type: 'model', model: m[1].trim() })],
  // RGB + input code + 1 flag (renamed or not) + the name.
  [/^RGB(\d{2})\d(.+)$/, (m) => ({ type: 'input-name', code: m[1], name: m[2].trim() })],
];

/**
 * Parse one line received from the receiver into a state change.
 * Returns null for lines that carry no state (the "R" heartbeat).
 */
export function parseLine(rawLine) {
  const line = String(rawLine).trim();
  if (line === '' || line === 'R') {
    return null;
  }
  for (const [pattern, build] of PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return build(match);
    }
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
 * Parse "code=name" pairs separated by commas, semicolons or line breaks,
 * e.g. "25=Apple TV, 05=TV". Malformed pairs are ignored.
 */
export function parseInputNames(text = '') {
  const names = new Map();
  for (const pair of String(text).split(/[\n,;]/)) {
    const [codePart, ...nameParts] = pair.split('=');
    const code = normalizeInputCode(codePart);
    const name = nameParts.join('=').trim();
    if (code && name) {
      names.set(code, name);
    }
  }
  return names;
}

/**
 * The input list of a receiver: the names it reported itself when it can
 * (`reported`, a list of { code, name }), the default list otherwise, then
 * the user's own names on top. Codes named only by the user are added.
 */
export function buildInputList(reported = [], customNames = '') {
  const base = reported.length > 0 ? reported : DEFAULT_INPUTS;
  const inputs = base.map((i) => ({ ...i }));
  for (const [code, name] of parseInputNames(customNames)) {
    const existing = inputs.find((i) => i.code === code);
    if (existing) {
      existing.name = name;
    } else {
      inputs.push({ code, name });
    }
  }
  return inputs;
}

/** Compact form of an input list, stored in a device param. */
export function encodeInputs(inputs) {
  return inputs.map((i) => `${i.code}=${i.name.replace(/[,;=\n]/g, ' ')}`).join(',');
}

/** Inverse of encodeInputs. */
export function decodeInputs(text) {
  return [...parseInputNames(text)].map(([code, name]) => ({ code, name }));
}
