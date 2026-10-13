// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real
// (reduced) open data: configuration actions, discovered devices, states,
// scene triggers, persistence, failures of the feeds.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { GTFS_RT_URL, GTFS_URL, TRIGGERS } from '../src/service.js';
import { NO_DEPARTURE_MINUTES } from '../src/devices.js';
import {
  FIXTURE_TIME,
  JEAN_JAURES,
  PADER,
  action,
  captureLogs,
  create,
  createFetch,
  createWorld,
  discovered,
  featureId,
  fixtureJson,
} from './helpers/world.js';
import { encodeFeed } from './helpers/protobuf.js';

const fr = (message) => message.fr;

test('nothing watched: no download at all, the status says so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(world.fake.discoveredDevices, []);
  const status = await action(world, 'status');
  assert.match(fr(status), /Arrêts surveillés : 0/);
  assert.match(fr(status), /Horaires : pas encore téléchargés/);
});

test('search: by name (accents and case ignored), around the home, nothing found', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const byName = await action(world, 'search_stops', { query: 'jean jaures' });
  assert.match(fr(byName), /3 arrêt\(s\) trouvé\(s\)/);
  assert.match(fr(byName), /• Jean Jaurès \[SA_1707\] — A, B, L1/);
  assert.match(byName.en, /To watch one/);
  const near = await action(world, 'search_stops', {});
  assert.match(fr(near), /Arrêts les plus proches de Maison/);
  assert.match(fr(near).split('\n')[1], /Jean Jaurès \[SA_1707\].* — 550 m$/);
  const none = await action(world, 'search_stops', { query: 'Zzyzx' });
  assert.equal(fr(none), 'Rien ne correspond à « Zzyzx ».');
  // The timetable was downloaded once and kept in /data.
  assert.equal(world.network.calls.filter((c) => c.url === GTFS_URL).length, 1);
  assert.ok((await stat(join(world.dataDir, 'gtfs.zip'))).size > 100000);
});

test('search around the home without a located house asks for a name', async (t) => {
  const world = await createWorld({
    houses: [{ id: 'h', name: 'Maison', selector: 'm', latitude: null, longitude: null }],
  });
  t.after(() => world.app.stop());
  assert.match(fr(await action(world, 'search_stops', {})), /Saisissez un nom/);
  assert.match(fr(await action(world, 'search_bike_stations', {})), /Saisissez un nom/);
});

test('add a stop: homonyms by identifier, line filter checked, then its device', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ambiguous = await action(world, 'add_stop', { stop: 'Jean Jaurès' });
  assert.match(fr(ambiguous), /Plusieurs résultats/);
  assert.match(fr(ambiguous), /SA_2224/);
  const wrongLine = await action(world, 'add_stop', { stop: 'SA_1707', lines: 'A, T1' });
  assert.match(
    fr(wrongLine),
    /Ligne\(s\) absente\(s\) de cet arrêt : T1\. Lignes desservies : A, B, L1/,
  );
  const added = await action(world, 'add_stop', { stop: 'sa_1707', lines: 'a l1' });
  assert.equal(
    fr(added),
    "Jean Jaurès ajouté (A, L1).\nOuvrez l'onglet Découverte pour créer son appareil.",
  );
  const device = discovered(world, 'Jean Jaurès');
  assert.equal(device.name, 'Tisséo · Jean Jaurès (A, L1)');
  assert.equal(device.should_poll, false);
  assert.deepEqual(
    device.features.map((f) => f.name),
    [
      'Métro A → Balma-Gramont',
      'Métro A → Balma-Gramont (suivant)',
      'Métro A → Basso Cambo',
      'Métro A → Basso Cambo (suivant)',
      'Linéo L1 → Fonsegrives Entiore',
      'Linéo L1 → Fonsegrives Entiore (suivant)',
      'Linéo L1 → Sept Deniers - Salvador Dali',
      'Linéo L1 → Sept Deniers - Salvador Dali (suivant)',
      'Prochains passages',
      'Info trafic',
    ],
  );
  assert.ok(device.external_id.endsWith(':stop:SA_1707'));
  assert.ok(featureId(device, 'a-0-next'));
  // Adding it again changes its lines.
  const updated = await action(world, 'add_stop', { stop: 'SA_1707' });
  assert.match(fr(updated), /Jean Jaurès mis à jour \(toutes les lignes\)/);
  assert.equal(discovered(world, 'Jean Jaurès').name, 'Tisséo · Jean Jaurès');
  const saved = JSON.parse(await readFile(join(world.dataDir, 'watch.json'), 'utf8'));
  assert.deepEqual(saved.stops, [{ id: JEAN_JAURES, name: 'Jean Jaurès', lines: [] }]);
});

test('states: published once the device is created, then only what changed', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'Pader' });
  assert.equal(world.fake.states.length, 0, 'nothing for a device not created yet');
  const device = await create(world, 'Pader');
  const next = featureId(device, 'l10-1-next');
  assert.equal(world.fake.lastState(next), 0);
  assert.equal(world.fake.lastState(featureId(device, 'l10-1-following')), 5);
  assert.match(world.fake.lastState(featureId(device, 'board')), /min/);
  assert.equal(world.fake.lastState(featureId(device, 'traffic')), 'Aucune perturbation');
  const count = world.fake.states.length;
  await world.service.refresh();
  assert.equal(world.fake.states.length, count, 'same minute, nothing new');
  world.clock.advance(60_000);
  await world.service.refresh();
  assert.ok(world.fake.states.length > count, 'a minute later, the countdowns moved');
  assert.ok(world.fake.states.length - count < device.features.length);
  assert.equal(
    world.fake.widgetRefreshes.at(-1)?.key ?? world.fake.widgetRefreshes.at(-1),
    'departures',
  );
});

test('a line with no departure in the next 24 hours reads the maximum', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'SA_1707', lines: 'CIMTR' });
  const device = await create(world, 'Jean Jaurès');
  for (const feature of device.features.filter((f) => f.category === 'duration')) {
    assert.equal(world.fake.lastState(feature.external_id), NO_DEPARTURE_MINUTES);
  }
  assert.equal(world.fake.lastState(featureId(device, 'board')), 'Aucun passage dans les 24 h');
});

test('the realtime feed: conditional requests, off in the configuration, night pace', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'Pader' });
  const rt = () => world.network.calls.filter((c) => c.url === GTFS_RT_URL);
  assert.ok(rt().length >= 1);
  world.network.routes[GTFS_RT_URL] = 304;
  world.clock.advance(60_000);
  await world.service.refresh();
  assert.equal(rt().at(-1).headers['if-none-match'], '"fixture"');
  assert.ok(world.service.realtime, 'a 304 keeps the last feed');

  // At 3 a.m., nothing scheduled within 90 minutes: every 15 minutes only.
  world.clock.time = Date.parse('2026-10-14T01:00:00Z');
  const before = rt().length;
  await world.service.refresh();
  world.clock.advance(5 * 60_000);
  await world.service.refresh();
  assert.equal(rt().length, before + 1);
  world.clock.advance(15 * 60_000);
  await world.service.refresh();
  assert.equal(rt().length, before + 2);

  await world.fake.configUpdated({ realtime: false });
  const off = rt().length;
  world.clock.advance(60_000);
  await world.service.refresh();
  assert.equal(rt().length, off);
  assert.equal(world.service.realtime, null);
  assert.match(fr(await action(world, 'status')), /Temps réel : désactivé/);
});

test('feeds down: the timetable keeps working, the logs say it once, no secret', async (t) => {
  const network = createFetch({ [GTFS_RT_URL]: new TypeError('fetch failed') });
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  const logs = captureLogs(t, 'warn');
  await action(world, 'add_stop', { stop: 'Pader' });
  const device = await create(world, 'Pader');
  assert.equal(typeof world.fake.lastState(featureId(device, 'l10-1-next')), 'number');
  world.clock.advance(60_000);
  await world.service.refresh();
  const lines = logs.filter((l) => /realtime feed unavailable/.test(l.text));
  assert.equal(lines.length, 1);
  assert.match(fr(await action(world, 'status')), /Dernière erreur : /);
});

test('the timetable cannot be downloaded: the actions explain it', async (t) => {
  const world = await createWorld({ network: createFetch({ [GTFS_URL]: 503 }) });
  t.after(() => world.app.stop());
  const message = await action(world, 'search_stops', { query: 'Pader' });
  assert.match(
    fr(message),
    /Les horaires Tisséo n'ont pas pu être téléchargés \(www\.data\.gouv\.fr: HTTP 503\)/,
  );
});

test('a corrupted download never replaces a good archive', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'Pader' });
  const path = join(world.dataDir, 'gtfs.zip');
  const size = (await stat(path)).size;
  // A day later, the portal answers an HTML page.
  const old = new Date(Date.now() - 25 * 3600 * 1000);
  await utimes(path, old, old);
  world.network.routes[GTFS_URL] = Buffer.from('<html>maintenance</html>');
  await world.service.ensureNetwork();
  assert.equal((await stat(path)).size, size);
  assert.ok(world.service.network.areas.has(PADER));
});

test('remove a stop, and restore the watch list from the devices after a /data loss', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'Pader' });
  await action(world, 'add_stop', { stop: 'SA_1707', lines: 'B' });
  const pader = await create(world, 'Pader');
  const jj = await create(world, 'Jean Jaurès');
  assert.match(fr(await action(world, 'remove', { name: 'pader' })), /^Pader retiré de la liste/);
  assert.match(fr(await action(world, 'remove', { name: 'Nowhere' })), /Rien de surveillé/);
  assert.equal(world.fake.discoveredDevices.length, 1);

  const again = await createWorld({ devices: [pader, jj] });
  t.after(() => again.app.stop());
  assert.deepEqual(
    again.service.watch.stops.map((s) => [s.id, s.lines]),
    [
      [PADER, []],
      [JEAN_JAURES, ['B']],
    ],
  );
});

test('bike stations: search, add, states, thresholds crossed fire the triggers', async (t) => {
  const network = createFetch();
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  const near = await action(world, 'search_bike_stations', {});
  assert.match(fr(near), /Stations les plus proches de Maison :\n• Alsace-Lorraine - Pomme \[3\]/);
  assert.match(
    fr(await action(world, 'add_bike_station', { station: 'lois capitole' })),
    /Lois - Capitole ajoutée/,
  );
  assert.match(
    fr(await action(world, 'add_bike_station', { station: '15' })),
    /Port St-Sauveur - Seel ajoutée/,
  );
  assert.match(fr(await action(world, 'add_bike_station', { station: '15' })), /déjà surveillée/);
  assert.match(
    fr(await action(world, 'add_bike_station', { station: 'nowhere' })),
    /Rien ne correspond/,
  );
  const device = await create(world, 'Port St-Sauveur');
  assert.deepEqual(
    device.features.map((f) => [f.name, f.category, f.type]),
    [
      ['Vélos disponibles', 'counter-sensor', 'integer'],
      ['Vélos mécaniques', 'counter-sensor', 'integer'],
      ['Vélos électriques', 'counter-sensor', 'integer'],
      ['Places libres', 'counter-sensor', 'integer'],
    ],
  );
  assert.equal(world.fake.lastState(featureId(device, 'electric')), 1);

  // Station 15 loses its electric bike, then gets three back.
  const url = Object.keys(network.routes).find((u) => u.endsWith('station_status.json'));
  const status = fixtureJson('gbfs/station_status.json');
  const station = status.data.stations.find((s) => s.station_id === '15');
  station.vehicle_types_available = [
    { vehicle_type_id: 'mechanical', count: 1 },
    { vehicle_type_id: 'electrical', count: 0 },
  ];
  station.num_bikes_available = 1;
  network.routes[url] = structuredClone(status);
  await world.service.refresh();
  const low = world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.BIKES_LOW);
  assert.deepEqual(low.map((e) => [e.data.bike_type, e.data.threshold]).sort(), [
    ['any', '1'],
    ['electric', '0'],
  ]);
  const event = low.find((e) => e.data.bike_type === 'electric');
  assert.equal(event.data.station, device.external_id);
  assert.equal(event.data.station_name, 'Port St-Sauveur - Seel');
  assert.equal(event.data.bikes, 0);

  station.vehicle_types_available[1].count = 3;
  station.num_bikes_available = 4;
  network.routes[url] = structuredClone(status);
  await world.service.refresh();
  const back = world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.BIKES_BACK);
  assert.deepEqual(back.map((e) => `${e.data.bike_type}>${e.data.threshold}`).sort(), [
    'any>1',
    'any>2',
    'any>3',
    'electric>0',
    'electric>1',
    'electric>2',
  ]);
});

test('disruptions: what is there at the first check is not announced, a new one is', async (t) => {
  const network = createFetch();
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'SA_1707', lines: 'L9, A' });
  assert.deepEqual(world.fake.sceneEvents, [], 'the alerts already published are known');
  const device = await create(world, 'Jean Jaurès');
  assert.match(world.fake.lastState(featureId(device, 'traffic')), /^L9 : /);

  const l9 = [...world.service.network.routes.values()].find((r) => r.short === 'L9').id;
  const metroA = [...world.service.network.routes.values()].find((r) => r.short === 'A').id;
  const feed = (alerts) => encodeFeed({ timestamp: FIXTURE_TIME / 1000 + 60, alerts });
  network.routes[GTFS_RT_URL] = feed([
    {
      id: 'A:line_A',
      routes: [metroA],
      header: 'A : Interruption entre Arènes et Mermoz',
      description: '<p>Navettes&nbsp;bus.</p>',
      url: 'https://www.tisseo.fr/info/A',
    },
    { id: 'A:line_X', routes: ['line:999'], header: 'Autre ligne' },
    { id: 'A:strike', agency: 'network:1', header: 'Grève jeudi' },
  ]);
  world.clock.advance(60_000);
  await world.service.refresh();
  const events = world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.DISRUPTION);
  assert.deepEqual(
    events.map((e) => e.data),
    [
      {
        scope: 'line',
        line: 'A',
        title: 'A : Interruption entre Arènes et Mermoz',
        description: 'Navettes bus.',
        url: 'https://www.tisseo.fr/info/A',
      },
      { scope: 'network', line: null, title: 'Grève jeudi', description: 'Grève jeudi', url: null },
    ],
  );
  assert.equal(
    world.fake.lastState(featureId(device, 'traffic')),
    'A : Interruption entre Arènes et Mermoz',
  );
  // Still there a minute later: announced once.
  world.clock.advance(60_000);
  network.routes[GTFS_RT_URL] = feed([
    { id: 'A:line_A', routes: [metroA], header: 'A : Interruption entre Arènes et Mermoz' },
    { id: 'A:strike', agency: 'network:1', header: 'Grève jeudi' },
  ]);
  await world.service.refresh();
  assert.equal(world.fake.sceneEvents.length, 2);
  // A restart remembers what was announced (/data).
  await world.app.stop();
  const again = await createWorld({
    network,
    dataDir: world.dataDir,
    clock: world.clock,
    devices: [device],
  });
  t.after(() => again.app.stop());
  assert.equal(again.fake.sceneEvents.length, 0);
  void l9;
});

test('scene actions: the sentence of a stop, of a line, of a station', async (t) => {
  const world = await createWorld({ config: { language: 'fr' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'Pader' });
  await action(world, 'add_stop', { stop: 'SA_1707', lines: 'A' });
  await action(world, 'add_bike_station', { station: '15' });
  const pader = await create(world, 'Pader');
  const jj = await create(world, 'Jean Jaurès');
  const bikes = await create(world, 'Port St-Sauveur');

  const all = await world.fake.sceneAction('get_next_departures', { stop: pader.external_id });
  assert.equal(all.success, true);
  const out = all.data.outputs;
  assert.equal(out.stop_name, 'Pader');
  assert.equal(out.line, 'Linéo L10');
  assert.equal(out.direction, 'La Vache');
  assert.deepEqual([out.minutes, out.following_minutes, out.realtime], [0, 5, 1]);
  assert.match(out.sentence, /^Linéo L10 vers La Vache à Pader : maintenant, puis dans 5 min\. /);

  const metro = await world.fake.sceneAction('get_next_departures', {
    stop: jj.external_id,
    line: 'a',
  });
  assert.match(
    metro.data.outputs.sentence,
    /^Métro A vers (Balma-Gramont|Basso Cambo) à Jean Jaurès : .* min \(théorique\)\. Métro A vers /,
  );
  assert.equal(metro.data.outputs.realtime, 0);

  const none = await world.fake.sceneAction('get_next_departures', {
    stop: jj.external_id,
    line: 'B',
  });
  assert.equal(none.data.outputs.sentence, 'Jean Jaurès : aucun passage dans les 24 h');
  assert.equal(none.data.outputs.minutes, NO_DEPARTURE_MINUTES);

  const station = await world.fake.sceneAction('get_bike_station', { station: bikes.external_id });
  assert.equal(
    station.data.outputs.sentence,
    'Port St-Sauveur - Seel : 2 vélo(s) (1 mécanique(s), 1 électrique(s)), ' +
      `${station.data.outputs.docks} place(s) libre(s).`,
  );
  assert.equal(station.data.outputs.in_service, 1);

  const unknown = await world.fake.sceneAction('get_next_departures', { stop: 'ext:other:x' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /n'est plus surveillé/);
});

test('the language of the configuration names the features and the texts', async (t) => {
  const world = await createWorld({ config: { language: 'es' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'SA_1707', lines: 'A' });
  const device = discovered(world, 'Jean Jaurès');
  assert.deepEqual(device.features.map((f) => f.name).slice(-2), [
    'Próximas salidas',
    'Info de tráfico',
  ]);
  assert.equal(device.features[0].name, 'Metro A → Balma-Gramont');
  const created = await create(world, 'Jean Jaurès');
  assert.equal(world.fake.lastState(featureId(created, 'traffic')), 'Sin incidencias');
});
