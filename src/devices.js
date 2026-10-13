// -----------------------------------------------------------------------------
// The Gladys devices of the integration and their states.
//
// - A stop (one per watched stop area): for each line and direction served,
//   the minutes before the next departure and before the following one; plus
//   the three soonest departures as text ("≈" marks a timetable time, the
//   others are real time) and the traffic info of its lines.
// - A VélôToulouse station: bikes available (all, mechanical, electric) and
//   free docks.
//
// Read-only, no polling: the integration refreshes everything on its own
// timer (src/service.js), Gladys never polls (`should_poll: false`).
// Countdowns and texts keep no history: a value re-read every minute whose
// past means nothing would write thousands of rows a day per stop.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { NAMES, TEXT, say } from './messages.js';

export const STOP_TYPE = 'stop';
export const BIKE_TYPE = 'bike';
// Published when nothing leaves in the next 24 hours (the countdown's max).
export const NO_DEPARTURE_MINUTES = 1440;
export const MAX_FEATURE_NAME = 60;
export const MAX_TEXT_STATE = 200;
const BOARD_ENTRIES = 3;

/** The platform id of a stop area: "stop_area:SA_1707" → "SA_1707". */
export function stopPlatformId(areaId) {
  return String(areaId)
    .split(':')
    .pop()
    .replace(/[^A-Za-z0-9_-]/g, '-');
}

/** Feature key part of a line: "L1" → "l1", "TELEO" → "teleo". */
export function lineSlug(short) {
  return String(short)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const nextKey = (route, dir) => `${lineSlug(route.short)}-${dir}-next`;
export const followingKey = (route, dir) => `${lineSlug(route.short)}-${dir}-following`;
export const BOARD_KEY = 'board';
export const TRAFFIC_KEY = 'traffic';
export const BIKE_KEYS = ['bikes', 'mechanical', 'electric', 'docks'];

/** "Métro A", "Tram T1", "Téléo", "Linéo L1", "Bus 15". */
export function lineLabel(route, language) {
  const names = NAMES[language] ?? NAMES.en;
  switch (route.mode) {
    case 'metro':
      return `${names.metro} ${route.short}`;
    case 'tram':
      return `${names.tram} ${route.short}`;
    case 'cable':
      return /^t[ée]l[ée]o$/i.test(route.short) ? 'Téléo' : route.short;
    case 'lineo':
      return `Linéo ${route.short}`;
    default:
      return `${names.bus} ${route.short}`;
  }
}

/** Shortens a text to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** "Métro A → Basso Cambo" (with `suffix` kept whole when the name is cut). */
function groupName(group, language, suffix = '') {
  const head = `${lineLabel(group.route, language)} → `;
  const tail = suffix ? ` ${suffix}` : '';
  return `${head}${clip(group.headsign, MAX_FEATURE_NAME - head.length - tail.length)}${tail}`;
}

/** "Poids de l'Huile" from the operator's "POIDS DE L'HUILE". */
export function prettyStationName(name) {
  const small = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'aux', 'au', 'en']);
  const value = String(name ?? '').trim();
  if (value !== value.toUpperCase()) {
    return value;
  }
  return value
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((word, index, words) => {
      if (!/\p{L}/u.test(word)) {
        return word;
      }
      // d'Arc, l'Huile: the elided article stays lower case.
      if ((word === 'd' || word === 'l') && words[index + 1] === "'" && index > 0) {
        return word;
      }
      if (small.has(word) && index > 0) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

const countdown = (name, externalId) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  min: 0,
  max: NO_DEPARTURE_MINUTES,
  read_only: true,
  has_feedback: false,
  keep_history: false,
});

const text = (name, externalId) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  // NOT NULL in the core, even for a text (422 on "Add to Gladys" without).
  min: 0,
  max: 0,
  read_only: true,
  has_feedback: false,
  keep_history: false,
});

/**
 * The device of a watched stop.
 * @param {object} gladys
 * @param {{ id: string, name: string, lines: string[] }} stop
 * @param {{ route: object, dir: number, headsign: string }[]} groups from lineGroups
 * @param {string} language
 */
export function buildStopDevice(gladys, stop, groups, language) {
  const ids = gladys.externalIds(STOP_TYPE, stopPlatformId(stop.id));
  const names = NAMES[language] ?? NAMES.en;
  const features = [];
  const used = new Set();
  const unique = (name) => {
    let candidate = name;
    for (let n = 2; used.has(candidate); n += 1) {
      candidate = `${clip(name, MAX_FEATURE_NAME - 3)} ${n}`;
    }
    used.add(candidate);
    return candidate;
  };
  for (const group of groups) {
    features.push(
      countdown(unique(groupName(group, language)), ids.feature(nextKey(group.route, group.dir))),
      countdown(
        unique(groupName(group, language, names.following)),
        ids.feature(followingKey(group.route, group.dir)),
      ),
    );
  }
  features.push(text(unique(names.board), ids.feature(BOARD_KEY)));
  features.push(text(unique(names.traffic), ids.feature(TRAFFIC_KEY)));
  const filter = stop.lines.length > 0 ? ` (${stop.lines.join(', ')})` : '';
  return {
    name: clip(`Tisséo · ${stop.name}${filter}`, 80),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'stop_id', value: stop.id },
      { name: 'lines', value: stop.lines.join(',') },
    ],
    features,
  };
}

/** "dans 3 et 7 min", "maintenant", "aucun passage dans les 24 h"... */
export function whenText(departures, language) {
  const [first, second] = departures;
  if (!first) {
    return say(TEXT, language, 'noDeparture').toLowerCase();
  }
  if (!second) {
    return first.minutes === 0
      ? say(TEXT, language, 'now')
      : say(TEXT, language, 'in', { minutes: first.minutes });
  }
  return first.minutes === 0
    ? say(TEXT, language, 'nowThen', { second: second.minutes })
    : say(TEXT, language, 'inTwo', { first: first.minutes, second: second.minutes });
}

/** The three soonest departures of the board: "L1 → Gare 2 min · A → Basso Cambo ≈4 min". */
export function boardText(board, language) {
  const soonest = board
    .flatMap((group) => group.departures.slice(0, 1).map((departure) => ({ group, departure })))
    .sort((a, b) => a.departure.at - b.departure.at)
    .slice(0, BOARD_ENTRIES);
  if (soonest.length === 0) {
    return say(TEXT, language, 'noDeparture');
  }
  return clip(
    soonest
      .map(({ group, departure }) => {
        const route = group.route.mode === 'cable' ? 'Téléo' : group.route.short;
        const mark = departure.realtime ? '' : '≈';
        return `${route} → ${clip(departure.headsign, 24)} ${mark}${departure.minutes} min`;
      })
      .join(' · '),
    MAX_TEXT_STATE,
  );
}

/**
 * The states of a stop device.
 * @param {object} gladys
 * @param {{ id: string }} stop
 * @param {object[]} board from buildBoard
 * @param {string} traffic the traffic info text
 * @param {string} language
 */
export function stopStates(gladys, stop, board, traffic, language) {
  const ids = gladys.externalIds(STOP_TYPE, stopPlatformId(stop.id));
  const states = [];
  for (const group of board) {
    const [next, following] = group.departures;
    states.push(
      {
        device_feature_external_id: ids.feature(nextKey(group.route, group.dir)),
        state: next ? Math.min(next.minutes, NO_DEPARTURE_MINUTES) : NO_DEPARTURE_MINUTES,
      },
      {
        device_feature_external_id: ids.feature(followingKey(group.route, group.dir)),
        state: following ? Math.min(following.minutes, NO_DEPARTURE_MINUTES) : NO_DEPARTURE_MINUTES,
      },
    );
  }
  states.push(
    { device_feature_external_id: ids.feature(BOARD_KEY), text: boardText(board, language) },
    {
      device_feature_external_id: ids.feature(TRAFFIC_KEY),
      text: clip(traffic || say(TEXT, language, 'noDisruption'), MAX_TEXT_STATE),
    },
  );
  return states;
}

/**
 * The device of a watched VélôToulouse station.
 * @param {object} gladys
 * @param {{ id: string, name: string, capacity?: number }} station
 * @param {string} language
 */
export function buildBikeDevice(gladys, station, language) {
  const ids = gladys.externalIds(BIKE_TYPE, station.id);
  const names = NAMES[language] ?? NAMES.en;
  // Display bounds only: a gauge or a chart needs a sensible maximum.
  const max = station.capacity > 0 ? station.capacity : 60;
  const counter = (key, name) => ({
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    min: 0,
    max,
    read_only: true,
    has_feedback: false,
  });
  return {
    name: clip(`VélôToulouse · ${station.name}`, 80),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'station_id', value: station.id }],
    features: BIKE_KEYS.map((key) => counter(key, names[key])),
  };
}

/** The states of a station device. */
export function bikeStates(gladys, station, status) {
  const ids = gladys.externalIds(BIKE_TYPE, station.id);
  return BIKE_KEYS.map((key) => ({
    device_feature_external_id: ids.feature(key),
    state: status[key],
  }));
}
