// -----------------------------------------------------------------------------
// Dashboard widgets: every content passes the SDK validation (vocabulary,
// budget of the core) as sent, in the four languages, and the tiles point at
// features the devices really have.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { departureValue, stationValue } from '../src/widgets.js';
import { action, create, createWorld } from './helpers/world.js';

const content = async (world, key, settings, language = 'fr') => {
  const ack = await world.fake.widgetGet(key, { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), [], JSON.stringify(ack.data.content));
  return ack.data.content;
};

test('departures: the board of a stop, real time in green, timetable flagged ≈', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: 'SA_1707' });
  await action(world, 'add_stop', { stop: 'Pader' });
  const jj = await create(world, 'Jean Jaurès');
  const pader = await create(world, 'Pader');
  for (const language of LANGUAGES) {
    const board = await content(world, 'departures', { stop: jj.external_id }, language);
    const [heading, caption, status] = board.components;
    assert.equal(heading.text, 'Jean Jaurès');
    assert.equal(caption.variant, 'caption');
    assert.equal(status.type, 'status');
    assert.equal(status.items.length, 10, 'ten rows at most');
    const metro = status.items.find((item) => /A → /.test(item.label));
    assert.match(metro.value, /^≈ \d+ · \d+ min$/);
    assert.equal(metro.color, 'info');
  }
  const board = await content(world, 'departures', { stop: pader.external_id });
  assert.ok(board.components[2].items.some((item) => item.color === 'success'));
  // The L9 disruption of the real feed shows in the caption of Jean Jaurès.
  const jjBoard = await content(world, 'departures', { stop: jj.external_id });
  assert.match(jjBoard.components[1].text, /^⚠ L9 : /);
});

test('departures: no stop chosen, a stop no longer watched', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.match((await content(world, 'departures', {})).components[0].text, /Choisissez un arrêt/);
  const gone = await content(world, 'departures', { stop: 'ext:test-integration:stop:SA_9' });
  assert.match(gone.components[0].text, /n'est plus surveillé/);
});

test('bike stations: tiles for one station, a row per station for several', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.match((await content(world, 'bike_stations', {})).components[0].text, /Aucune station/);
  await action(world, 'add_bike_station', { station: '15' });
  await action(world, 'add_bike_station', { station: '1' });
  const seel = await create(world, 'Port St-Sauveur');
  const one = await content(world, 'bike_stations', { stations: [seel.external_id] });
  const tiles = one.components.filter((c) => c.type === 'value');
  assert.equal(tiles.length, 4);
  const ids = new Set(seel.features.map((f) => f.external_id));
  for (const tile of tiles) {
    assert.ok(ids.has(tile.device_feature), tile.device_feature);
  }
  for (const language of LANGUAGES) {
    const all = await content(world, 'bike_stations', { stations: [] }, language);
    assert.equal(all.components[0].items.length, 2);
  }
  const all = await content(world, 'bike_stations', {});
  assert.deepEqual(all.components[0].items[0], {
    label: 'Port St-Sauveur - Seel',
    value: all.components[0].items[0].value,
    color: 'warning',
  });
  assert.match(all.components[0].items[0].value, /^1 méca · 1 élec · \d+ places$/);
  assert.equal(all.components[0].items[1].color, 'danger');
});

test('the values fit their row (40 characters)', () => {
  assert.equal(departureValue({ departures: [] }), '—');
  assert.equal(
    departureValue({ departures: [{ minutes: 3, realtime: true }, { minutes: 12 }] }),
    '3 · 12 min',
  );
  for (const language of LANGUAGES) {
    const value = stationValue(
      { inService: true, mechanical: 30, electric: 30, docks: 40, bikes: 60 },
      language,
    );
    assert.ok(value.length <= 40, value);
  }
  assert.equal(stationValue({ inService: false }, 'fr'), 'Hors service');
});
