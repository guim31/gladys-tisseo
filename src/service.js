// -----------------------------------------------------------------------------
// The integration at runtime: what is watched (stops, bike stations), the
// data behind it (static timetable, realtime feed, GBFS), the refresh timers,
// the published devices and states, the configuration actions and the scene
// triggers.
//
// Data flow:
//   - static GTFS: downloaded to /data at most once a day, parsed in one
//     streaming pass (src/gtfs.js); parsed again when a stop is added;
//   - GTFS-RT: read at each refresh while stops are watched (conditional
//     request, ~1.7 MB), every 15 minutes only when no departure is
//     scheduled within the next 90 minutes (the night);
//   - GBFS: station list on demand and daily, station status at each refresh
//     while stations are watched.
// -----------------------------------------------------------------------------

import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { alertKey, readAlerts, trafficText } from './alerts.js';
import { DEFAULT_CONFIG, normalizeConfig } from './config.js';
import {
  buildBoard,
  compareRoutes,
  indexRealtime,
  lineGroups,
  resolveLines,
  upcomingDepartures,
} from './departures.js';
import {
  BIKE_TYPE,
  STOP_TYPE,
  bikeStates,
  buildBikeDevice,
  buildStopDevice,
  clip,
  lineLabel,
  prettyStationName,
  stopPlatformId,
  stopStates,
  whenText,
} from './devices.js';
import { Gbfs, GBFS_URL } from './gbfs.js';
import { decodeFeed } from './gtfsrt.js';
import { parseGtfs } from './gtfs.js';
import { downloadFile, getBuffer } from './http.js';
import { REPORTS, TEXT, lines, render, say } from './messages.js';
import { formatDistance, nearest, normalize, searchByName } from './search.js';
import { dataDirectory } from './store.js';
import { localDate } from './time.js';
import { listEntries } from './zip.js';

const logger = createLogger({ name: 'tisseo' });

export const GTFS_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/64318177-f5b5-4144-a6be-2d0f22d26c77';
export const GTFS_RT_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/b2343456-4e73-4e5e-bf0f-e8cab63357a8';

export const GTFS_FILE = 'gtfs.zip';
export const MAX_STOPS = 20;
export const MAX_STATIONS = 20;
export const SEARCH_RESULTS = 10;
export const GTFS_MAX_AGE_MS = 24 * 3600 * 1000;
export const STATIONS_MAX_AGE_MS = 24 * 3600 * 1000;
// No departure within this delay on any watched stop: the realtime feed is
// read every NIGHT_REALTIME_MS only.
export const QUIET_HORIZON_MS = 90 * 60 * 1000;
export const NIGHT_REALTIME_MS = 15 * 60 * 1000;
// An announced alert that left the feed this long ago may be announced again.
export const ALERT_MEMORY_MS = 6 * 3600 * 1000;
const DAILY_CHECK_MS = 3600 * 1000;

export const TRIGGERS = {
  DISRUPTION: 'line_disruption',
  BIKES_LOW: 'bikes_low',
  BIKES_BACK: 'bikes_back',
};
export const BIKE_THRESHOLDS = [0, 1, 2, 3, 5];
export const BIKE_KINDS = ['any', 'mechanical', 'electric'];
const KIND_FIELD = { any: 'bikes', mechanical: 'mechanical', electric: 'electric' };

/** An error whose message is already written for the user, in every language. */
export class UserError extends Error {
  constructor(messages) {
    super(messages.en);
    this.messages = messages;
  }
}

const reportError = (key, params) => new UserError(render(REPORTS, key, params));

/** "A, L1 15" → ["A", "L1", "15"]. */
export function parseLineList(value) {
  return [
    ...new Set(
      String(value ?? '')
        .split(/[\s,;|]+/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

export class Tisseo {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {object} options.store persistence of the watch list (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: they call the refreshes
   * @param {string} [options.dataDir]
   * @param {{ gtfs?: string, realtime?: string, gbfs?: string }} [options.urls]
   */
  constructor({
    gladys,
    store,
    fetch = globalThis.fetch,
    now = Date.now,
    timers = true,
    dataDir = dataDirectory(),
    urls = {},
  }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetch;
    this.now = now;
    this.useTimers = timers;
    this.dataDir = dataDir;
    this.urls = { gtfs: GTFS_URL, realtime: GTFS_RT_URL, gbfs: GBFS_URL, ...urls };
    this.gbfs = new Gbfs({ fetch, url: this.urls.gbfs });
    this.config = normalizeConfig(DEFAULT_CONFIG);
    this.watch = { stops: [], stations: [], alerts: { seen: {}, followed: null } };

    this.network = null;
    this.networkTask = null;
    this.networkStale = false;
    this.gtfsDate = null;
    this.gtfsError = null;

    this.realtime = null;
    this.realtimeEtag = null;
    this.realtimeAt = null;
    this.realtimeError = null;
    this.alerts = [];
    this.boards = new Map();

    this.stationInfo = null;
    this.stationInfoAt = null;
    this.bikeStatus = new Map();
    this.bikeStatusAt = null;
    this.bikeError = null;

    this.timer = null;
    this.dailyTimer = null;
    this.stopped = false;
    this.refreshing = null;
  }

  // --- lifecycle --------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    this.watch = {
      stops: Array.isArray(saved.stops) ? saved.stops.filter((s) => s?.id) : [],
      stations: Array.isArray(saved.stations) ? saved.stations.filter((s) => s?.id) : [],
      alerts: {
        seen: saved.alerts?.seen && typeof saved.alerts.seen === 'object' ? saved.alerts.seen : {},
        followed: Array.isArray(saved.alerts?.followed) ? saved.alerts.followed : null,
      },
    };
    await this.restoreFromDevices();
    await this.publishDiscovered();
    this.schedule();
    // Data loads in the background (a first download takes a minute):
    // actions wait for it, widgets and scene actions say so.
    this.loading = this.loadData().catch((err) => logger.error('Data load failed', err));
  }

  /** Gladys restarted: everything again, the states included. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates?.();
    await this.publishDiscovered();
    await this.publishAllStates();
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (previous.language !== config.language) {
      this.gladys.forgetPublishedStates?.();
    }
    this.schedule();
    await this.publishDiscovered();
    await this.refresh();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.dailyTimer);
    await this.store.flush();
  }

  schedule() {
    if (!this.useTimers || this.stopped) {
      return;
    }
    clearTimeout(this.timer);
    clearTimeout(this.dailyTimer);
    const tick = () => {
      this.timer = setTimeout(async () => {
        await this.refresh().catch((err) => logger.warn(`Refresh failed: ${err.message}`));
        if (!this.stopped) {
          tick();
        }
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    };
    tick();
    const daily = () => {
      this.dailyTimer = setTimeout(async () => {
        await this.dailyCheck().catch((err) => logger.warn(`Daily check failed: ${err.message}`));
        if (!this.stopped) {
          daily();
        }
      }, DAILY_CHECK_MS);
      this.dailyTimer.unref?.();
    };
    daily();
  }

  /** First load: timetable (when stops are watched), station list, then a refresh. */
  async loadData() {
    if (this.watch.stops.length > 0) {
      await this.ensureNetwork().catch(() => {});
    }
    if (this.watch.stations.length > 0) {
      await this.ensureStations().catch(() => {});
    }
    await this.publishDiscovered();
    await this.refresh();
  }

  /** Hourly: a timetable older than a day, a station list older than a day. */
  async dailyCheck() {
    if (this.watch.stops.length > 0) {
      await this.ensureNetwork().catch(() => {});
    }
    if (
      this.watch.stations.length > 0 &&
      (!this.stationInfoAt || this.now() - this.stationInfoAt > STATIONS_MAX_AGE_MS)
    ) {
      await this.ensureStations({ force: true }).catch(() => {});
      await this.publishDiscovered();
    }
  }

  /** The stops and stations of the devices created in Gladys but missing from /data. */
  async restoreFromDevices() {
    let devices;
    try {
      devices = await this.gladys.getDevices();
    } catch (err) {
      logger.warn(`Cannot read the devices of the integration: ${err.message}`);
      return;
    }
    const param = (device, name) => device.params?.find((p) => p.name === name)?.value;
    let changed = false;
    for (const device of devices ?? []) {
      const stopId = param(device, 'stop_id');
      if (stopId && !this.watch.stops.some((stop) => stop.id === stopId)) {
        this.watch.stops.push({
          id: stopId,
          name: String(device.name ?? stopId).replace(/^Tisséo · /, ''),
          lines: parseLineList(param(device, 'lines')),
        });
        changed = true;
      }
      const stationId = param(device, 'station_id');
      if (stationId && !this.watch.stations.some((station) => station.id === stationId)) {
        this.watch.stations.push({
          id: stationId,
          name: String(device.name ?? stationId).replace(/^VélôToulouse · /, ''),
          capacity: 0,
        });
        changed = true;
      }
    }
    if (changed) {
      logger.info('Watched stops and stations restored from the Gladys devices');
      await this.save();
    }
  }

  save() {
    return this.store.save(this.watch);
  }

  // --- static timetable -------------------------------------------------------

  get gtfsPath() {
    return join(this.dataDir, GTFS_FILE);
  }

  async gtfsAge() {
    try {
      const info = await stat(this.gtfsPath);
      // File times are wall-clock times, whatever clock the rest follows.
      return { mtime: info.mtimeMs, age: Date.now() - info.mtimeMs };
    } catch {
      return null;
    }
  }

  /**
   * The parsed timetable, downloaded when missing or older than a day, parsed
   * again when the watched stops changed. One task at a time: callers share it.
   */
  ensureNetwork({ reparse = false } = {}) {
    if (reparse) {
      this.networkStale = true;
    }
    if (this.networkTask) {
      // A load in progress may have read the watched stops before the change:
      // once it is over, parse again if it did not take the change in.
      return reparse
        ? this.networkTask
            .catch(() => {})
            .then(() => this.ensureNetwork({ reparse: this.networkStale }))
        : this.networkTask;
    }
    this.networkTask = this.loadNetwork().finally(() => {
      this.networkTask = null;
    });
    return this.networkTask;
  }

  async loadNetwork() {
    let downloaded = false;
    const file = await this.gtfsAge();
    if (!file || file.age > GTFS_MAX_AGE_MS || file.age < -GTFS_MAX_AGE_MS) {
      try {
        await mkdir(this.dataDir, { recursive: true });
        const size = await downloadFile(this.fetch, this.urls.gtfs, this.gtfsPath, {
          validate: async (path) => {
            const entries = await listEntries(path);
            if (!entries.has('stop_times.txt') || !entries.has('stops.txt')) {
              throw new Error('not a GTFS archive');
            }
          },
        });
        downloaded = true;
        this.gtfsError = null;
        logger.info(`Tisséo timetable downloaded (${Math.round(size / 1e6)} MB)`);
      } catch (err) {
        this.gtfsError = err.message;
        logger.warn(`Tisséo timetable download failed: ${err.message}`);
        if (!file) {
          throw err;
        }
      }
    }
    if (this.network && !downloaded && !this.networkStale && !this.windowEnding()) {
      return this.network;
    }
    do {
      this.networkStale = false;
      const watched = new Set(this.watch.stops.map((stop) => stop.id));
      const started = Date.now();
      try {
        this.network = await parseGtfs(this.gtfsPath, { watched, now: this.now() });
      } catch (err) {
        this.gtfsError = err.message;
        logger.error(`Tisséo timetable unreadable: ${err.message}`);
        throw err;
      }
      this.gtfsDate = (await this.gtfsAge())?.mtime ?? this.now();
      logger.info(
        `Tisséo timetable read in ${Date.now() - started} ms: ${this.network.stats.areas} stop areas, ${this.network.stats.trips} trips over ${this.network.dates.length} days`,
      );
    } while (this.networkStale);
    return this.network;
  }

  /** True when today is past the middle of the parsed window (parse again). */
  windowEnding() {
    if (!this.network) {
      return true;
    }
    const today = this.network.dates.indexOf(localDate(this.now(), this.network.timeZone));
    return today < 0 || today > 2;
  }

  /** The timetable for an action: waits for a load in progress, explains a failure. */
  async networkForAction() {
    try {
      return await this.ensureNetwork();
    } catch (err) {
      throw reportError('gtfsFailed', { reason: err.message });
    }
  }

  // --- VélôToulouse stations ----------------------------------------------------

  async ensureStations({ force = false } = {}) {
    if (this.stationInfo && !force) {
      return this.stationInfo;
    }
    try {
      this.stationInfo = await this.gbfs.stations();
      this.stationInfoAt = this.now();
      // Keep the names and capacities of the watched stations up to date.
      let changed = false;
      for (const station of this.watch.stations) {
        const info = this.stationInfo.get(station.id);
        if (info) {
          const name = prettyStationName(info.name);
          if (station.name !== name || station.capacity !== info.capacity) {
            station.name = name;
            station.capacity = info.capacity;
            changed = true;
          }
        }
      }
      if (changed) {
        await this.save();
      }
      return this.stationInfo;
    } catch (err) {
      this.bikeError = err.message;
      logger.warn(`VélôToulouse stations unavailable: ${err.message}`);
      throw err;
    }
  }

  // --- devices ----------------------------------------------------------------

  stopDevice(stop) {
    if (!this.network?.areas.has(stop.id)) {
      return null;
    }
    const groups = lineGroups(this.network, stop.id, resolveLines(this.network, stop.lines));
    return buildStopDevice(this.gladys, stop, groups, this.config.language);
  }

  stationDevice(station) {
    return buildBikeDevice(this.gladys, station, this.config.language);
  }

  stopDeviceId(stop) {
    return this.gladys.externalIds(STOP_TYPE, stopPlatformId(stop.id)).device;
  }

  stationDeviceId(station) {
    return this.gladys.externalIds(BIKE_TYPE, station.id).device;
  }

  async publishDiscovered() {
    const devices = [
      ...this.watch.stops.map((stop) => this.stopDevice(stop)).filter(Boolean),
      ...this.watch.stations.map((station) => this.stationDevice(station)),
    ];
    try {
      await this.gladys.publishDiscoveredDevices(devices);
    } catch (err) {
      logger.warn(`Cannot publish the discovered devices: ${err.message}`);
    }
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  stopOfDevice(externalId) {
    return this.watch.stops.find((stop) => this.stopDeviceId(stop) === externalId);
  }

  stationOfDevice(externalId) {
    return this.watch.stations.find((station) => this.stationDeviceId(station) === externalId);
  }

  async publish(states) {
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states);
    } catch (err) {
      logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
    }
  }

  stopStatesOf(stop) {
    const board = this.boards.get(stop.id);
    if (!board) {
      return [];
    }
    const routes = this.followedRoutesOf(stop);
    return stopStates(
      this.gladys,
      stop,
      board,
      trafficText(this.alerts, routes),
      this.config.language,
    );
  }

  async publishAllStates() {
    const states = [];
    for (const stop of this.watch.stops) {
      if (this.isCreated(this.stopDeviceId(stop))) {
        states.push(...this.stopStatesOf(stop));
      }
    }
    for (const station of this.watch.stations) {
      const status = this.bikeStatus.get(station.id);
      if (status && this.isCreated(this.stationDeviceId(station))) {
        states.push(...bikeStates(this.gladys, station, status));
      }
    }
    await this.publish(states);
  }

  /** A device was just added in Gladys: its states, all of them, now. */
  async onDeviceCreated(device) {
    const stop = this.stopOfDevice(device?.external_id);
    if (stop) {
      if (!this.boards.has(stop.id) && this.network) {
        this.boards.set(stop.id, buildBoard(this.network, this.realtime, stop, this.now()));
      }
      await this.publish(this.stopStatesOf(stop));
      this.gladys.requestWidgetRefresh?.('departures')?.catch?.(() => {});
      return;
    }
    const station = this.stationOfDevice(device?.external_id);
    if (station) {
      const status = this.bikeStatus.get(station.id);
      if (status) {
        await this.publish(bikeStates(this.gladys, station, status));
      }
      this.gladys.requestWidgetRefresh?.('bike_stations')?.catch?.(() => {});
    }
  }

  // --- refresh ------------------------------------------------------------------

  /** One refresh of everything watched; concurrent calls share it. */
  refresh() {
    if (!this.refreshing) {
      this.refreshing = Promise.allSettled([this.refreshTransit(), this.refreshBikes()]).finally(
        () => {
          this.refreshing = null;
        },
      );
    }
    return this.refreshing;
  }

  /** The routes a stop follows: its line filter, or every line serving it. */
  followedRoutesOf(stop) {
    if (!this.network) {
      return new Set();
    }
    return (
      resolveLines(this.network, stop.lines) ??
      new Set(this.network.areas.get(stop.id)?.routes ?? [])
    );
  }

  /** True when a watched stop has a departure scheduled soon (realtime worth reading). */
  busySoon(now) {
    return this.watch.stops.some(
      (stop) =>
        upcomingDepartures(this.network, null, stop.id, {
          now,
          routes: resolveLines(this.network, stop.lines),
          horizonMs: QUIET_HORIZON_MS,
        }).length > 0,
    );
  }

  async refreshRealtime(now) {
    if (!this.config.realtime) {
      this.realtime = null;
      return;
    }
    if (this.realtimeAt && !this.busySoon(now) && now - this.realtimeAt < NIGHT_REALTIME_MS) {
      return;
    }
    try {
      const { body, etag, notModified } = await getBuffer(this.fetch, this.urls.realtime, {
        etag: this.realtime ? this.realtimeEtag : null,
      });
      if (!notModified) {
        this.realtime = indexRealtime(decodeFeed(body));
        this.realtimeEtag = etag;
      }
      this.realtimeAt = now;
      if (this.realtimeError) {
        logger.info('Tisséo realtime feed back');
      }
      this.realtimeError = null;
    } catch (err) {
      if (!this.realtimeError) {
        logger.warn(`Tisséo realtime feed unavailable, timetable only: ${err.message}`);
      }
      this.realtimeError = err.message;
      // A feed older than 10 minutes is worse than the timetable.
      if (this.realtimeAt && now - this.realtimeAt > 10 * 60 * 1000) {
        this.realtime = null;
      }
    }
  }

  async refreshTransit() {
    if (this.watch.stops.length === 0 || !this.network) {
      return;
    }
    const now = this.now();
    await this.refreshRealtime(now);
    this.alerts = this.realtime
      ? readAlerts(this.realtime.alerts, { now, language: this.config.language })
      : [];
    const states = [];
    for (const stop of this.watch.stops) {
      if (!this.network.areas.has(stop.id)) {
        continue;
      }
      this.boards.set(stop.id, buildBoard(this.network, this.realtime, stop, now));
      if (this.isCreated(this.stopDeviceId(stop))) {
        states.push(...this.stopStatesOf(stop));
      }
    }
    await this.publish(states);
    if (this.realtime) {
      await this.checkAlerts(now);
    }
  }

  /** Fires `line_disruption` for every alert not announced yet on a followed line. */
  async checkAlerts(now) {
    const followed = new Set();
    for (const stop of this.watch.stops) {
      for (const route of this.followedRoutesOf(stop)) {
        followed.add(route);
      }
    }
    const memory = this.watch.alerts;
    const firstCheck = memory.followed === null;
    const known = new Set(memory.followed ?? []);
    const events = [];
    const present = new Set();
    for (const alert of this.alerts) {
      const targets = alert.network ? [null] : alert.routes.filter((route) => followed.has(route));
      for (const route of targets) {
        const key = `${alertKey(alert)}|${route ?? 'network'}`;
        present.add(key);
        if (key in memory.seen) {
          continue;
        }
        // Not announced: what was already there at the first check, or on a
        // line that was not followed yet (the stop has just been added).
        if (!firstCheck && (route === null || known.has(route))) {
          const short = route ? this.network.routes.get(route)?.short : null;
          events.push({
            scope: route ? 'line' : 'network',
            line: short ?? null,
            title: clip(alert.title, 300),
            description: clip(alert.description || alert.title, 1000),
            url: alert.url || null,
          });
        }
      }
    }
    let changed =
      firstCheck || JSON.stringify([...followed].sort()) !== JSON.stringify([...known].sort());
    for (const key of present) {
      if (memory.seen[key] === undefined || now - memory.seen[key] > 60 * 1000) {
        memory.seen[key] = now;
        changed = true;
      }
    }
    for (const [key, seenAt] of Object.entries(memory.seen)) {
      if (!present.has(key) && now - seenAt > ALERT_MEMORY_MS) {
        delete memory.seen[key];
        changed = true;
      }
    }
    memory.followed = [...followed].sort();
    if (changed) {
      await this.save();
    }
    for (const data of events) {
      await this.fire(TRIGGERS.DISRUPTION, data);
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
    }
  }

  async refreshBikes() {
    if (this.watch.stations.length === 0) {
      return;
    }
    let statuses;
    try {
      statuses = await this.gbfs.status();
      this.bikeStatusAt = this.now();
      if (this.bikeError) {
        logger.info('VélôToulouse feed back');
      }
      this.bikeError = null;
    } catch (err) {
      if (!this.bikeError) {
        logger.warn(`VélôToulouse feed unavailable: ${err.message}`);
      }
      this.bikeError = err.message;
      return;
    }
    const states = [];
    const events = [];
    for (const station of this.watch.stations) {
      const status = statuses.get(station.id);
      if (!status) {
        continue;
      }
      const previous = this.bikeStatus.get(station.id);
      this.bikeStatus.set(station.id, status);
      const deviceId = this.stationDeviceId(station);
      if (this.isCreated(deviceId)) {
        states.push(...bikeStates(this.gladys, station, status));
      }
      if (previous) {
        events.push(...this.bikeEvents(station, deviceId, previous, status));
      }
    }
    await this.publish(states);
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  /** The bike thresholds crossed between two readings, for every kind of bike. */
  bikeEvents(station, deviceId, previous, current) {
    const events = [];
    for (const kind of BIKE_KINDS) {
      const field = KIND_FIELD[kind];
      const before = previous[field];
      const after = current[field];
      for (const threshold of BIKE_THRESHOLDS) {
        const crossedDown = before > threshold && after <= threshold;
        const crossedUp = before <= threshold && after > threshold;
        if (!crossedDown && !crossedUp) {
          continue;
        }
        events.push({
          key: crossedDown ? TRIGGERS.BIKES_LOW : TRIGGERS.BIKES_BACK,
          data: {
            station: deviceId,
            bike_type: kind,
            threshold: String(threshold),
            station_name: station.name,
            bikes: after,
            docks: current.docks,
          },
        });
      }
    }
    return events;
  }

  // --- configuration actions ------------------------------------------------------

  async home() {
    try {
      const houses = await this.gladys.getHouses();
      const house = (houses ?? []).find(
        (h) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude),
      );
      return house ? { name: house.name, lat: house.latitude, lon: house.longitude } : null;
    } catch (err) {
      logger.warn(`Cannot read the position of the houses: ${err.message}`);
      return null;
    }
  }

  routeNames(routeIds) {
    return routeIds
      .map((id) => this.network.routes.get(id))
      .filter(Boolean)
      .sort(compareRoutes)
      .map((route) => route.short);
  }

  stopLine(area, distance) {
    const routes = this.routeNames(area.routes);
    const shown = routes.length > 12 ? `${routes.slice(0, 12).join(', ')}…` : routes.join(', ');
    const where =
      distance === null || distance === undefined
        ? ''
        : ` — ${formatDistance(distance, this.config.language)}`;
    return `• ${area.name} [${stopPlatformId(area.id)}] — ${shown || '-'}${where}`;
  }

  stationLine(station, distance) {
    const where =
      distance === null || distance === undefined
        ? ''
        : ` — ${formatDistance(distance, this.config.language)}`;
    return `• ${prettyStationName(station.name)} [${station.id}]${where}`;
  }

  /** Stop areas served by at least one line in the timetable window. */
  servedAreas() {
    return [...this.network.areas.values()].filter((area) => area.routes.length > 0);
  }

  async searchStops({ query } = {}) {
    await this.networkForAction();
    const home = await this.home();
    let found;
    let header;
    if (normalize(query)) {
      found = searchByName(this.servedAreas(), query, { near: home }).slice(0, SEARCH_RESULTS);
      if (found.length === 0) {
        throw reportError('noMatch', { query });
      }
      header = render(REPORTS, 'foundStops', { count: found.length });
    } else {
      if (!home) {
        throw reportError('noQuery');
      }
      found = nearest(this.servedAreas(), home, SEARCH_RESULTS);
      header = render(REPORTS, 'closestStops', { house: home.name });
    }
    return lines(
      header,
      found.map(({ item, distance }) => this.stopLine(item, distance)).join('\n'),
      render(REPORTS, 'addStopHint'),
    );
  }

  /** The stop area meant by a name or an identifier. */
  async resolveStop(query) {
    const network = await this.networkForAction();
    const wanted = String(query ?? '').trim();
    const byId = [...network.areas.values()].find(
      (area) =>
        area.id === wanted || stopPlatformId(area.id).toLowerCase() === wanted.toLowerCase(),
    );
    if (byId) {
      return byId;
    }
    const home = await this.home();
    const matches = searchByName(this.servedAreas(), wanted, { near: home });
    const exact = matches.filter(({ item }) => normalize(item.name) === normalize(wanted));
    const candidates = exact.length > 0 ? exact : matches;
    if (candidates.length === 1) {
      return candidates[0].item;
    }
    if (candidates.length === 0) {
      throw reportError('noMatch', { query: wanted });
    }
    throw new UserError(
      lines(
        render(REPORTS, 'ambiguous', { query: wanted }),
        candidates
          .slice(0, SEARCH_RESULTS)
          .map(({ item, distance }) => this.stopLine(item, distance))
          .join('\n'),
      ),
    );
  }

  async addStop({ stop: query, lines: lineField } = {}) {
    const area = await this.resolveStop(query);
    const served = this.routeNames(area.routes);
    const wanted = parseLineList(lineField);
    const unknown = wanted.filter(
      (line) => !served.some((short) => short.toUpperCase() === line.toUpperCase()),
    );
    if (unknown.length > 0) {
      throw reportError('unknownLines', {
        lines: unknown.join(', '),
        available: served.join(', '),
      });
    }
    const chosen = served.filter((short) =>
      wanted.some((line) => line.toUpperCase() === short.toUpperCase()),
    );
    const existing = this.watch.stops.find((stop) => stop.id === area.id);
    if (!existing && this.watch.stops.length >= MAX_STOPS) {
      throw reportError('tooMany', { max: MAX_STOPS });
    }
    if (existing) {
      existing.lines = chosen;
      existing.name = area.name;
    } else {
      this.watch.stops.push({ id: area.id, name: area.name, lines: chosen });
    }
    await this.save();
    // Its departures are only kept by a new pass over the timetable.
    if (!existing) {
      await this.networkForAction().then(() => this.ensureNetwork({ reparse: true }));
    }
    await this.publishDiscovered();
    await this.refresh();
    const label = (language) =>
      chosen.length > 0 ? chosen.join(', ') : say(REPORTS, language, 'allLines');
    return Object.fromEntries(
      Object.keys(REPORTS).map((language) => [
        language,
        [
          say(REPORTS, language, existing ? 'stopUpdated' : 'stopAdded', {
            name: area.name,
            lines: label(language),
          }),
          say(REPORTS, language, 'toDiscovery'),
        ].join('\n'),
      ]),
    );
  }

  async stationsForAction() {
    try {
      return await this.ensureStations();
    } catch (err) {
      throw reportError('gbfsFailed', { reason: err.message });
    }
  }

  async searchStations({ query } = {}) {
    const stations = await this.stationsForAction();
    const home = await this.home();
    const items = [...stations.values()].map((station) => ({
      ...station,
      name: prettyStationName(station.name),
    }));
    let found;
    let header;
    if (normalize(query)) {
      found = searchByName(items, query, { near: home }).slice(0, SEARCH_RESULTS);
      if (found.length === 0) {
        throw reportError('noMatch', { query });
      }
      header = render(REPORTS, 'foundStations', { count: found.length });
    } else {
      if (!home) {
        throw reportError('noQuery');
      }
      found = nearest(items, home, SEARCH_RESULTS);
      header = render(REPORTS, 'closestStations', { house: home.name });
    }
    return lines(
      header,
      found.map(({ item, distance }) => this.stationLine(item, distance)).join('\n'),
      render(REPORTS, 'addStationHint'),
    );
  }

  async addStation({ station: query } = {}) {
    const stations = await this.stationsForAction();
    const wanted = String(query ?? '').trim();
    let station = stations.get(wanted.replace(/^#/, ''));
    if (!station) {
      const items = [...stations.values()];
      const matches = searchByName(items, wanted, { near: await this.home() });
      const exact = matches.filter(({ item }) => normalize(item.name) === normalize(wanted));
      const candidates = exact.length > 0 ? exact : matches;
      if (candidates.length === 0) {
        throw reportError('noMatch', { query: wanted });
      }
      if (candidates.length > 1) {
        throw new UserError(
          lines(
            render(REPORTS, 'ambiguous', { query: wanted }),
            candidates
              .slice(0, SEARCH_RESULTS)
              .map(({ item, distance }) => this.stationLine(item, distance))
              .join('\n'),
          ),
        );
      }
      station = candidates[0].item;
    }
    const name = prettyStationName(station.name);
    if (this.watch.stations.some((watched) => watched.id === station.id)) {
      return render(REPORTS, 'stationKnown', { name });
    }
    if (this.watch.stations.length >= MAX_STATIONS) {
      throw reportError('tooMany', { max: MAX_STATIONS });
    }
    this.watch.stations.push({ id: station.id, name, capacity: station.capacity });
    await this.save();
    await this.publishDiscovered();
    await this.refresh();
    return lines(render(REPORTS, 'stationAdded', { name }), render(REPORTS, 'toDiscovery'));
  }

  async remove({ name: query } = {}) {
    const wanted = normalize(query);
    const isMatch = (entry, platformId) =>
      normalize(entry.name) === wanted ||
      normalize(entry.id) === wanted ||
      normalize(platformId) === wanted;
    const stop = this.watch.stops.find((entry) => isMatch(entry, stopPlatformId(entry.id)));
    const station = stop ? null : this.watch.stations.find((entry) => isMatch(entry, entry.id));
    if (!wanted || (!stop && !station)) {
      throw reportError('notWatched', { query: String(query ?? '') });
    }
    if (stop) {
      this.watch.stops = this.watch.stops.filter((entry) => entry !== stop);
      this.boards.delete(stop.id);
    } else {
      this.watch.stations = this.watch.stations.filter((entry) => entry !== station);
      this.bikeStatus.delete(station.id);
    }
    await this.save();
    await this.publishDiscovered();
    return render(REPORTS, 'removed', { name: (stop ?? station).name });
  }

  status() {
    const now = this.now();
    const language = this.config.language;
    const date = (ms) =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'short',
        timeZone: this.network?.timeZone ?? 'Europe/Paris',
      }).format(ms);
    const day = (yyyymmdd) =>
      date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8), 12));
    const stopsList = this.watch.stops
      .map(
        (stop) =>
          `• ${stop.name} [${stopPlatformId(stop.id)}]${stop.lines.length ? ` (${stop.lines.join(', ')})` : ''}`,
      )
      .join('\n');
    const stationsList = this.watch.stations
      .map((station) => `• ${station.name} [${station.id}]`)
      .join('\n');
    const tracked = this.realtime
      ? new Set([...this.realtime.trips.keys(), ...this.realtime.added.map((u) => u.id)]).size
      : 0;
    const errors = [this.gtfsError, this.realtimeError, this.bikeError].filter(Boolean);
    return lines(
      render(REPORTS, 'watchedStops', { count: this.watch.stops.length }),
      stopsList || null,
      render(REPORTS, 'watchedStations', { count: this.watch.stations.length }),
      stationsList || null,
      this.network
        ? render(REPORTS, 'timetable', {
            date: date(this.gtfsDate),
            until: day(this.network.dates.at(-1)),
          })
        : render(REPORTS, 'timetableMissing'),
      !this.config.realtime
        ? render(REPORTS, 'realtimeOff')
        : this.realtimeAt
          ? render(REPORTS, 'realtime', {
              age: Math.round((now - this.realtimeAt) / 1000),
              tracked,
            })
          : render(REPORTS, 'realtimeWaiting'),
      this.bikeStatusAt
        ? render(REPORTS, 'bikes', { age: Math.round((now - this.bikeStatusAt) / 1000) })
        : render(REPORTS, 'bikesWaiting'),
      errors.length > 0 ? render(REPORTS, 'lastError', { error: errors.join(' / ') }) : null,
    );
  }

  // --- reads for the widgets and the scene actions ----------------------------------

  /** The board of the stop of a device, computed now. */
  boardOf(deviceId) {
    const stop = this.stopOfDevice(deviceId);
    if (!stop || !this.network?.areas.has(stop.id)) {
      return null;
    }
    return { stop, board: buildBoard(this.network, this.realtime, stop, this.now()) };
  }

  trafficOf(stop) {
    return this.alerts.filter((alert) =>
      alert.routes.some((route) => this.followedRoutesOf(stop).has(route)),
    );
  }

  /** "Métro A vers Basso Cambo à Jean Jaurès : dans 3 et 7 min (théorique)". */
  sentence(stop, group, language) {
    const text = say(TEXT, language, 'sentence', {
      line: lineLabel(group.route, language),
      direction: group.departures[0]?.headsign ?? group.headsign,
      stop: stop.name,
      when: whenText(group.departures, language),
    });
    const scheduled = group.departures.length > 0 && !group.departures[0].realtime;
    return scheduled ? `${text} (${say(TEXT, language, 'scheduled')})` : text;
  }
}
