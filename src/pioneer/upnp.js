// -----------------------------------------------------------------------------
// UPnP helpers used to FIND receivers on the network.
//
// Pioneer receivers of this generation are UPnP/DLNA devices: they answer
// SSDP searches and describe themselves (manufacturer, model, unique UDN) in
// an XML document. The UDN never changes, unlike the IP address: it is the
// best id we can give a receiver in Gladys.
//
// Broadcast SSDP cannot leave the integration container, so the multicast
// search is run by the Gladys core (`gladys.scanNetwork('ssdp')`). A UNICAST
// search towards a known IP does cross the container NAT: that is how an
// address typed by the user is turned into the same UDN.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';

export const SSDP_SEARCH_TARGET = 'upnp:rootdevice';

/** Parse the raw text of an SSDP answer into lowercase-keyed headers. */
export function parseSsdpHeaders(text) {
  const headers = {};
  for (const line of String(text).split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  return headers;
}

/** "uuid:5f9ec1b3-...::upnp:rootdevice" -> "5f9ec1b3-..." */
export function uuidFromUsn(usn) {
  const match = String(usn ?? '').match(/uuid:([0-9a-zA-Z-]+)/);
  return match ? match[1].toLowerCase() : null;
}

function xmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, 'i'));
  return match ? match[1] : null;
}

/** Extract the fields we need from a UPnP device description. */
export function parseDescription(xml) {
  return {
    manufacturer: xmlTag(xml, 'manufacturer'),
    modelName: xmlTag(xml, 'modelName'),
    friendlyName: xmlTag(xml, 'friendlyName'),
    uuid: uuidFromUsn(xmlTag(xml, 'UDN')),
  };
}

/** Does this description belong to a Pioneer (or Pioneer-made Elite) device? */
export function isPioneer(description, server = '') {
  const text = `${description?.manufacturer ?? ''} ${description?.modelName ?? ''} ${server}`;
  return /pioneer|\b(VSX|SC|SC-LX|VSA)-?\d/i.test(text);
}

/** Download and parse the description document at `location`. */
export async function fetchDescription(location, timeoutMs = 3_000) {
  const response = await fetch(location, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${location}`);
  }
  return parseDescription(await response.text());
}

/**
 * Unicast SSDP search towards one known IP. Resolves the parsed headers of
 * the first answer, or null when the device stays silent.
 */
export function unicastSearch(host, { timeoutMs = 2_000, createSocket = dgram.createSocket } = {}) {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const finish = (value) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.on('error', () => finish(null));
    socket.on('message', (message) => finish(parseSsdpHeaders(message.toString('utf8'))));
    const request = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${host}:1900`,
      'MAN: "ssdp:discover"',
      'MX: 1',
      `ST: ${SSDP_SEARCH_TARGET}`,
      '',
      '',
    ].join('\r\n');
    socket.send(request, 1900, host, (err) => {
      if (err) {
        finish(null);
      }
    });
  });
}
