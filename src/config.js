// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of the manifest.
// This module provides the defaults and normalizes the received object, so the
// rest of the code never deals with `undefined` or numbers sent as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST match the `default` values of the manifest config_schema.
export const DEFAULT_CONFIG = {
  hosts: '',
  max_volume_db: 0,
  input_names: '',
};

function numberOr(value, fallback, min, max) {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    hosts: String(raw.hosts ?? ''),
    max_volume_db: numberOr(raw.max_volume_db, DEFAULT_CONFIG.max_volume_db, -80, 12),
    input_names: String(raw.input_names ?? ''),
  };
}
