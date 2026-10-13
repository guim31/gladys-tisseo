# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Next departures at the Tisséo stops you choose (metro, tram, Téléo, Linéo,
  buses): one device per stop, with the minutes before the next departure and
  the following one for each line and direction, the three soonest departures
  as text, and the traffic info of its lines.
- Real time from the Tisséo GTFS-Realtime feed for the buses, the tram and
  Téléo (delays, cancellations, skipped stops); the metro and untracked
  vehicles use the timetable, marked "≈".
- VélôToulouse stations: bikes available, mechanical and electric bikes, free
  docks.
- Configuration actions to find stops and stations by name or around your
  home, add them (with an optional line filter), remove them and check the
  data feeds.
- Dashboard widgets "Next departures" and "VélôToulouse".
- Scene triggers "Tisséo disruption", "Bikes running out at a station" and
  "Bikes back at a station".
- Scene actions "Read the next Tisséo departures" and "Read a VélôToulouse
  station", with a sentence ready to send.
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-tisseo/commits/main
