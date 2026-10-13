# Tisséo for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that brings the public
transport of **Toulouse** into Gladys: the next departures at your stops (metro, tram, Téléo,
Linéo, buses) corrected in real time, the traffic alerts of their lines, and the bikes and docks of
your **VélôToulouse** stations. Everything comes from open data: no account, no API key.

> **Built and tested on the real data, not yet in a real Gladys: feedback welcome.** The
> integration is covered by automated tests on reduced copies of the real Tisséo timetable,
> realtime feed and VélôToulouse feed (captured on 13 October 2026), and its container was run
> against the live feeds; it has not yet run in a Gladys installation. Please report what works and
> what does not in the [issues](https://github.com/guim31/gladys-tisseo/issues) or on the forum.

## Features

- **One device per stop**: for each line and direction, the minutes before the next departure and
  before the following one (duration features, usable in the "Device state change" trigger), the
  three soonest departures as text ("≈" marks a timetable time), and the traffic info of its
  lines. An optional line filter per stop ("A, L1").
- **One device per VélôToulouse station**: bikes available, mechanical bikes, electric bikes, free
  docks (with history).
- **Real time where Tisséo publishes it** (buses, tram, Téléo cabins): delays, cancellations and
  skipped stops from the GTFS-Realtime feed. The metro is timetable only (Tisséo does not publish it
  in real time).
- **Stops and stations chosen from Gladys**: search by name (accents and case ignored) or around
  your home (house position, `location` contract), add, remove — configuration actions, no
  identifier to look up elsewhere.
- **Dashboard widgets**: _Next departures_ (the board of a stop) and _VélôToulouse_ (your stations).
- **Scene triggers**: _Tisséo disruption_ (a new alert on a followed line, or on the whole network),
  _Bikes running out at a station_ and _Bikes back at a station_ (threshold crossed, per bike type).
- **Scene actions**: _Read the next Tisséo departures_ and _Read a VélôToulouse station_, with a
  sentence ready to send ("Métro A vers Basso Cambo à Jean Jaurès : dans 3 et 7 min").
- English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions, house location).
- Internet access from the Gladys machine.
- About 20 MB under `/data` for the timetable archive.

## Installation

1. In Gladys: **Integrations → Install from GitHub**, then enter
   `https://github.com/guim31/gladys-tisseo`.
2. On install, Gladys asks to share the **position of your houses** (`location`): it is only used to
   list the stops and stations closest to home.
3. In the **Configuration** tab: _Find a stop_, _Add a stop_, _Find a bike station_, _Add a bike
   station_; then create the devices in the **Discover** tab.

The full guide is in [docs/en.md](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)).

## How it works

| Data                    | Source (open data, ODbL)                                                                                                   | Refresh                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Timetable (GTFS, 15 MB) | [Tisséo on transport.data.gouv.fr](https://transport.data.gouv.fr/datasets/tisseo-reseau-transport-urbain-toulousain)      | once a day at most, archive kept in `/data`                     |
| Real time (GTFS-RT)     | same dataset (`api.tisseo.fr/opendata/gtfsrt`)                                                                             | each refresh (1 min by default); every 15 min when nothing runs |
| VélôToulouse (GBFS 2.3) | [VLS VélôToulouse](https://transport.data.gouv.fr/datasets/velotoulouse-velo-en-libre-service-au-standard-gbfs) (JCDecaux) | station list daily, status at each refresh                      |

- The 90 MB of stop times are **streamed** out of the archive (own ZIP and CSV readers, no
  dependency) and only the departures of the watched stops are kept: about 15 MB of heap for the
  whole network, within the 256 MB of the Gladys sandbox.
- The GTFS-Realtime feed is decoded by a minimal protobuf reader (trip updates and alerts only),
  checked field by field against `gtfs-realtime-bindings` on the real feed.
- Devices are published with `should_poll: false`: the integration refreshes them on its own timer
  and publishes only the values that changed.
- The realtime feed weighs ~1.7 MB: about 100 MB per hour at one refresh per minute. Choose a slower
  refresh or turn real time off on a metered connection.

## Limitations

- Toulouse only. The metro is timetable only.
- **No park-and-ride occupancy**: the `parkings-relais` dataset of Toulouse Métropole only gives
  their capacity, not their free spaces, so the integration does not create park-and-ride devices.
- The official Tisséo API (`api.tisseo.fr/v2`, key on request) is not used: the open feeds give the
  same departures without any account.
- Traffic alert texts are in French (as published by Tisséo).
- A countdown is accurate to the refresh interval.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test: real (reduced) Tisséo and VélôToulouse data + the SDK's fake Gladys
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store --skip-image-check .   # store validator
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/app.js            handlers → service, configuration actions
src/service.js        watch list, feeds, timers, devices and states, triggers, actions
src/gtfs.js           streaming parse of the static GTFS
src/zip.js, csv.js    ZIP and CSV readers (streams)
src/gtfsrt.js         GTFS-Realtime decoder (protobuf)
src/departures.js     departure board: timetable + realtime corrections
src/alerts.js         service alerts: plain text, followed lines
src/gbfs.js           VélôToulouse GBFS
src/devices.js        Gladys devices and states
src/scenes.js         scene actions
src/widgets.js        dashboard widgets
src/search.js         search by name, distance
src/http.js           downloads (timeouts, size caps, conditional requests)
src/time.js           GTFS service days in Europe/Paris
src/messages.js       texts sent from the container, four languages
src/store.js          /data persistence
src/config.js         configuration defaults and normalization
```

## Credits

- Data: [Tisséo](https://www.tisseo.fr), [Toulouse Métropole](https://data.toulouse-metropole.fr)
  and [VélôToulouse](https://velotoulouse.tisseo.fr) (JCDecaux), under the
  [Open Database License](https://opendatacommons.org/licenses/odbl/). The test fixtures are reduced
  extracts of these feeds.
- The [TCL integration](https://github.com/prohand/gladys-transport-commun-lyonnais) of prohand
  (Lyon, Apache-2.0) for the shape of a transit integration in Gladys: departures, bike stations,
  scene sentence.
- [Home Assistant](https://www.home-assistant.io)'s GTFS integrations and
  [gtfs-realtime-bindings](https://github.com/MobilityData/gtfs-realtime-bindings) (Apache-2.0) for
  the GTFS-Realtime semantics (delay propagation, canceled and added trips).

- Cover: the Tisséo logo from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Logo_Tiss%C3%A9o_Voyageurs.png)
  (CC BY-SA 4.0, Tisséo), without its "Voyageurs" subtitle.

Not affiliated with Tisséo, Toulouse Métropole or JCDecaux.

## License

Apache-2.0, see [LICENSE](LICENSE).
