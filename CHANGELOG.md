# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Changed

- The volume is shown and set as 0-100 % of the receiver's scale instead of
  decibels, and the maximum volume setting is a percentage (80 % by default).
  Created receivers need the "Update" button of the Discovery tab once.

## [1.0.5] - 2026-10-12

### Changed

- The dashboard widget is now "Receiver status": power, live volume, sound and
  current input, display only. The controls (on/off switch, volume slider,
  input list) come from Gladys' standard "Devices" widget.

## [1.0.4] - 2026-10-12

### Added

- "Receiver remote" dashboard widget: power, volume, input and listening mode
  of a receiver zone, with power, volume and listening mode (or mute) buttons.

## [1.0.3] - 2026-10-12

### Fixed

- Receivers found by the scan now show up in the Discovery tab: option labels
  are sent as plain text, as the Gladys core requires. Scan errors are logged.

## [1.0.2] - 2026-10-12

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

[Unreleased]: https://github.com/daviddu26/gladys-pioneer-legacy/compare/v1.0.5...HEAD
[1.0.5]: https://github.com/daviddu26/gladys-pioneer-legacy/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/daviddu26/gladys-pioneer-legacy/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/daviddu26/gladys-pioneer-legacy/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/daviddu26/gladys-pioneer-legacy/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/daviddu26/gladys-pioneer-legacy/releases/tag/v1.0.1
