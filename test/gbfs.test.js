// -----------------------------------------------------------------------------
// VélôToulouse GBFS: discovery, station list and status, on real (reduced)
// feeds of the operator.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gbfs, feedUrls, parseStations, parseStatus, vehicleKinds } from '../src/gbfs.js';
import { createFetch, fixtureJson } from './helpers/world.js';

test('the discovery file gives the feed URLs', () => {
  const urls = feedUrls(fixtureJson('gbfs/gbfs.json'));
  assert.match(
    urls.station_information,
    /^https:\/\/api\.cyclocity\.fr\/.+station_information\.json$/,
  );
  assert.match(urls.station_status, /station_status\.json$/);
});

test('stations: names, positions, capacity', () => {
  const stations = parseStations(fixtureJson('gbfs/station_information.json'));
  const first = stations.get('1');
  assert.equal(first.name, "POIDS DE L'HUILE");
  assert.ok(first.capacity > 0);
  assert.ok(Math.abs(first.lat - 43.604) < 0.01);
});

test('status: mechanical and electric bikes from the vehicle types, docks, service', () => {
  const kinds = vehicleKinds(fixtureJson('gbfs/vehicle_types.json'));
  assert.equal(kinds.get('electrical'), 'electric');
  assert.equal(kinds.get('mechanical'), 'mechanical');
  const status = parseStatus(fixtureJson('gbfs/station_status.json'), kinds);
  const mixed = status.get('15');
  assert.deepEqual(
    { bikes: mixed.bikes, mechanical: mixed.mechanical, electric: mixed.electric },
    { bikes: 2, mechanical: 1, electric: 1 },
  );
  assert.equal(typeof mixed.docks, 'number');
  assert.equal(mixed.inService, true);
});

test('status: other GBFS shapes and closed stations', () => {
  const status = parseStatus({
    data: {
      stations: [
        {
          station_id: 7,
          num_bikes_available: 3,
          num_bikes_available_types: { mechanical: 1, ebike: 2 },
        },
        { station_id: 'x', num_bikes_available: 4, num_docks_available: -2, is_renting: false },
      ],
    },
  });
  assert.deepEqual(status.get('7'), {
    bikes: 3,
    mechanical: 1,
    electric: 2,
    docks: 0,
    inService: true,
    reportedAt: null,
  });
  assert.equal(status.get('x').mechanical, 4);
  assert.equal(status.get('x').docks, 0);
  assert.equal(status.get('x').inService, false);
});

test('the client discovers once, and again after a failure', async () => {
  const network = createFetch();
  const gbfs = new Gbfs({ fetch: network.fetch });
  await gbfs.stations();
  await gbfs.status();
  await gbfs.status();
  const discoveries = network.calls.filter((call) => call.url.includes('data.gouv.fr'));
  assert.equal(discoveries.length, 1);
  const status = Object.keys(network.routes).find((url) => url.endsWith('station_status.json'));
  network.routes[status] = 503;
  await assert.rejects(gbfs.status(), /HTTP 503/);
  network.routes[status] = fixtureJson('gbfs/station_status.json');
  await gbfs.status();
  assert.equal(network.calls.filter((call) => call.url.includes('data.gouv.fr')).length, 2);
});
