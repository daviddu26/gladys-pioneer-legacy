// -----------------------------------------------------------------------------
// Find the receivers to offer in the Gladys Discovery tab.
//
// Two sources, merged by IP address:
//   1. an SSDP search run by the Gladys core: every UPnP device on the LAN
//      answers, we keep the Pioneer ones (from their description document);
//   2. the addresses typed by the user, for receivers SSDP cannot see (other
//      VLAN, UPnP disabled...). They are asked for their UDN in unicast.
// Each candidate is then probed: only receivers that answer the legacy
// protocol are offered, with the features they actually support.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { probeReceiver } from './pioneer/probe.js';
import {
  SSDP_SEARCH_TARGET,
  fetchDescription,
  isPioneer,
  parseSsdpHeaders,
  unicastSearch,
  uuidFromUsn,
} from './pioneer/upnp.js';

const logger = createLogger({ name: 'discovery' });

/** Split the "Receiver addresses" setting: "192.168.1.30, 192.168.1.31". */
export function parseHosts(text = '') {
  return [
    ...new Set(
      String(text)
        .split(/[\s,;]+/)
        .map((h) => h.trim())
        .filter((h) => /^[a-zA-Z0-9.-]+$/.test(h)),
    ),
  ];
}

/**
 * Stable platform id of a receiver: its UPnP UDN when known (it survives an
 * IP change), else its MAC address, else its IP address as a last resort.
 */
export function platformIdOf({ uuid, mac, host }) {
  if (uuid) {
    return uuid;
  }
  if (mac) {
    return `mac-${mac.toLowerCase().replace(/[^0-9a-f]/g, '')}`;
  }
  return `ip-${host.replace(/[^0-9a-zA-Z]/g, '-')}`;
}

async function describe(location, fetchDesc) {
  try {
    return await fetchDesc(location);
  } catch (err) {
    logger.debug(`No UPnP description at ${location}: ${err.message}`);
    return null;
  }
}

/**
 * @returns {Promise<{ receivers: object[], ignored: { host: string, reason: string }[] }>}
 */
export async function discoverReceivers(
  gladys,
  config,
  { probe = probeReceiver, search = unicastSearch, fetchDesc = fetchDescription } = {},
) {
  const candidates = new Map();

  // 1. Multicast SSDP search, run by the core.
  let answers = [];
  try {
    answers = await gladys.scanNetwork('ssdp', { timeoutSeconds: 5 });
  } catch (err) {
    logger.warn(`SSDP scan failed: ${err.message}`);
  }
  for (const answer of answers) {
    if (candidates.has(answer.source_ip)) {
      continue;
    }
    const headers = parseSsdpHeaders(answer.headers);
    if (!headers.location) {
      continue;
    }
    const description = await describe(headers.location, fetchDesc);
    if (!isPioneer(description, headers.server)) {
      continue;
    }
    candidates.set(answer.source_ip, {
      host: answer.source_ip,
      uuid: description?.uuid ?? uuidFromUsn(headers.usn),
      mac: answer.source_mac,
      friendlyName: description?.friendlyName,
      upnpModel: description?.modelName,
    });
  }

  // 2. Addresses typed by the user.
  for (const host of parseHosts(config.hosts)) {
    if (candidates.has(host)) {
      continue;
    }
    const candidate = { host };
    const headers = await search(host);
    if (headers?.location) {
      const description = await describe(headers.location, fetchDesc);
      candidate.uuid = description?.uuid ?? uuidFromUsn(headers.usn);
      candidate.friendlyName = description?.friendlyName;
      candidate.upnpModel = description?.modelName;
    } else if (headers?.usn) {
      candidate.uuid = uuidFromUsn(headers.usn);
    }
    candidates.set(host, candidate);
  }

  // 3. Probe every candidate for the legacy protocol and its capabilities.
  const receivers = [];
  const ignored = [];
  for (const candidate of candidates.values()) {
    const result = await probe(candidate.host, { logger });
    if (result?.protocol === 'legacy') {
      receivers.push({
        ...candidate,
        platformId: platformIdOf(candidate),
        port: result.port,
        model: result.model ?? candidate.upnpModel ?? null,
        capabilities: result.capabilities,
        inputs: result.inputs,
      });
    } else {
      const reason = result?.protocol === 'eiscp' ? 'eiscp' : 'no-answer';
      logger.info(`Receiver ${candidate.host} ignored (${reason})`);
      ignored.push({ host: candidate.host, reason });
    }
  }
  return { receivers, ignored };
}

export { SSDP_SEARCH_TARGET };
