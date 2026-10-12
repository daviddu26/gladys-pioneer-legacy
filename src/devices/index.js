// -----------------------------------------------------------------------------
// Device registry.
//
// The integration drives one device: the receiver. The registry keeps the
// template's dispatch shape so index.js stays a thin wiring layer:
//   - key, deviceExternalId(gladys), buildDevice(gladys, config)
//   - onSetValue(gladys, {...}), startPush(gladys, config)
// -----------------------------------------------------------------------------

import { receiver } from './receiver.js';

export const DEVICE_BLUEPRINTS = [receiver];

/**
 * Build the discovery payload for Gladys. A blueprint returns null while it
 * cannot describe its device yet (no receiver address configured).
 */
export function buildDiscoveredDevices(gladys, config) {
  return DEVICE_BLUEPRINTS.map((bp) => bp.buildDevice(gladys, config)).filter(Boolean);
}

/**
 * Find the blueprint that owns a given device, from its external_id.
 */
export function findBlueprintByDevice(gladys, device) {
  return DEVICE_BLUEPRINTS.find((bp) => bp.deviceExternalId(gladys) === device.external_id);
}
