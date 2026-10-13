# Test fixtures

Reduced extracts of the real open data feeds, captured on **13 October 2026 at
17:19 (Toulouse time)**, under the
[Open Database License](https://opendatacommons.org/licenses/odbl/) (Tisséo,
Toulouse Métropole, VélôToulouse / JCDecaux). Public transit data: nothing
personal in them.

- `gtfs/tisseo-gtfs-sample.zip`: the Tisséo GTFS reduced to seven stop areas
  (the three "Jean Jaurès", Pader, and the three Téléo stations), the trips
  that serve them from 12 to 15 October 2026, their stop times at these stops
  (all the stop times of the Téléo trips), their routes and calendar dates.
  Original files, rows filtered, columns untouched.
- `gtfs/tisseo-gtfsrt-sample.pb`: the GTFS-Realtime feed of the same minute,
  reduced to the trip updates of the trips serving Jean Jaurès or Pader (their
  stop time updates cut after the last one at these stops), every Téléo trip
  update, two network alerts and eight line alerts. Entities copied byte for
  byte, only the cut trip updates re-encoded.
- `gbfs/`: the VélôToulouse discovery file, vehicle types, and the information
  and status of seven stations.
- `gladys-feature-table.json`: the category/type couples, units and poll
  frequencies the Gladys core knows (extracted from its code).
