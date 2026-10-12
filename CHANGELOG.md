# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-12

### Added

- Control of legacy Pioneer AV receivers over IP (port 8102 or 23): power,
  volume in dB with a configurable maximum, volume up/down, mute, input
  selection with renameable inputs, listening mode groups.
- Automatic discovery of the receivers (SSDP/UPnP), plus receiver addresses
  typed by the user, and a "Check an IP address" button.
- Several receivers, each probed for its port, model, zone 2 / zone 3, input
  names and listening mode report; only what it supports is exposed.
- Real-time feedback of the changes made with the remote or the front panel.
- "Test the connection" and "Send a command" buttons in the Configuration
  screen, and a "Send a Pioneer command" scene action.
- A cover image for the Gladys catalog (`cover.jpg`, drawn from `cover.svg`).

[Unreleased]: https://github.com/daviddu26/gladys-pioneer-legacy/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/daviddu26/gladys-pioneer-legacy/releases/tag/v1.0.1
