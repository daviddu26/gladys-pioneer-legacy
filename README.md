# Gladys Pioneer Legacy

A [Gladys Assistant](https://gladysassistant.com) external integration for
**older Pioneer AV receivers** (about 2010 to 2015, e.g. VSX-528) that speak
the legacy Pioneer IP control protocol on port 8102, not the Onkyo eISCP
protocol of recent models.

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md).

## Features

Power, volume (dB, with a configurable maximum), volume up/down, mute, input
selection (renameable inputs), listening mode (Auto surround / Advanced), real
time feedback of the changes made with the remote, a raw command button and a
"send a Pioneer command" scene action.

## Project structure

```
index.js                     SDK wiring only
src/pioneer/protocol.js      legacy Pioneer protocol: parsing, codes (pure)
src/pioneer/client.js        persistent TCP client with reconnection
src/devices/receiver.js      the receiver device (features, commands, state)
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

The tests run against a simulated receiver: no network needed.

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
