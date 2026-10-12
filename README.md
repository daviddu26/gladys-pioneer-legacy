# Gladys Pioneer Legacy

A [Gladys Assistant](https://gladysassistant.com) external integration for
**older Pioneer AV receivers** (about 2009 to 2015, e.g. VSX-528) that speak
the legacy Pioneer IP control protocol on port 8102 or 23, not the Onkyo eISCP
protocol of recent models.

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md).

## Features

- Automatic discovery (SSDP/UPnP through the Gladys core), plus addresses
  typed by the user for receivers on another network.
- Each receiver is probed: port (8102 or 23), model, zone 2 / zone 3, input
  names, listening mode report. Only what answers is exposed.
- Any number of receivers. Per zone: power, volume in dB (configurable max),
  volume up/down, mute, input. Main zone: listening mode groups, current mode.
- Real-time feedback of the changes made with the remote.
- Raw command button and "send a Pioneer command" scene action.

Command codes come from Pioneer's official "AVR IP & RS-232" sheets,
cross-checked against the openHAB pioneeravr binding and aiopioneer, and
against a real VSX-528.

## Project structure

```
index.js                     SDK wiring only
src/pioneer/protocol.js      legacy Pioneer protocol: parsing, codes (pure)
src/pioneer/client.js        persistent TCP client with reconnection
src/pioneer/upnp.js          SSDP / UPnP description helpers
src/pioneer/probe.js         port, model and capability detection
src/discovery.js             finds the receivers (SSDP + typed addresses)
src/devices/receiver.js      the receiver devices (zones, commands, state)
src/actions.js               Configuration screen buttons
src/scenes.js                scene actions
src/config.js                defaults + normalization (mirrors the manifest)
gladys-assistant-integration.json   the manifest
docs/en.md, docs/fr.md       user documentation (re-hosted by Gladys)
```

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store admission checks
```

The tests run against simulated receivers (a VSX-528 and a bigger model): no
network needed.

## Release

Actions → **Release** → Run workflow (patch / minor / major). It bumps the
version in `package.json` and the manifest, builds the multi-arch image on
`ghcr.io`, and publishes a GitHub Release. Make the `ghcr.io` package public
once, and add the `gladys-assistant-integration` topic to the repository so
the Gladys store indexes it.

## Credits

Built from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).
License: Apache-2.0.
