// -----------------------------------------------------------------------------
// VélôToulouse, through its open GBFS feed (JCDecaux "Cyclocity", GBFS 2.3,
// no key): station_information (names, positions, capacity, refreshed daily)
// and station_status (bikes and docks, refreshed with the departure boards).
//
// The entry point is the stable data.gouv.fr link of the "VLS VélôToulouse"
// dataset, which redirects to the operator's gbfs.json; the feed URLs come
// from that discovery file, never hard-coded.
// -----------------------------------------------------------------------------

import { getJson, HttpError } from './http.js';

export const GBFS_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/ca5c6590-57a5-418a-83e6-e8343bfe2be7';

/** The feed URLs announced by gbfs.json, by name (French first, then any language). */
export function feedUrls(discovery) {
  const data = discovery?.data ?? {};
  const languages = [data.fr, data.en, ...Object.values(data)].filter(Boolean);
  const urls = {};
  for (const language of languages) {
    for (const feed of language.feeds ?? []) {
      if (feed?.name && typeof feed.url === 'string' && !urls[feed.name]) {
        urls[feed.name] = feed.url;
      }
    }
  }
  return urls;
}

/** vehicle_type_id → 'electric' | 'mechanical', from vehicle_types.json. */
export function vehicleKinds(vehicleTypes) {
  const kinds = new Map();
  for (const type of vehicleTypes?.data?.vehicle_types ?? []) {
    const electric = /electric/.test(type.propulsion_type ?? '');
    kinds.set(String(type.vehicle_type_id), electric ? 'electric' : 'mechanical');
  }
  return kinds;
}

const count = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** station_information.json → Map(id → { id, name, lat, lon, address, capacity }). */
export function parseStations(information) {
  const stations = new Map();
  for (const station of information?.data?.stations ?? []) {
    if (station?.station_id === undefined || !station.name) {
      continue;
    }
    const id = String(station.station_id);
    stations.set(id, {
      id,
      name: String(station.name),
      lat: Number(station.lat),
      lon: Number(station.lon),
      address: station.address ? String(station.address) : '',
      capacity: count(station.capacity),
    });
  }
  return stations;
}

/**
 * station_status.json → Map(id → { bikes, mechanical, electric, docks,
 * inService, reportedAt }).
 */
export function parseStatus(status, kinds = new Map()) {
  const result = new Map();
  for (const station of status?.data?.stations ?? []) {
    if (station?.station_id === undefined) {
      continue;
    }
    const bikes = count(station.num_bikes_available);
    let mechanical = 0;
    let electric = 0;
    if (Array.isArray(station.vehicle_types_available)) {
      for (const entry of station.vehicle_types_available) {
        const id = String(entry.vehicle_type_id);
        const kind = kinds.get(id) ?? (/elec|ebike/i.test(id) ? 'electric' : 'mechanical');
        if (kind === 'electric') {
          electric += count(entry.count);
        } else {
          mechanical += count(entry.count);
        }
      }
    } else if (station.num_bikes_available_types) {
      // GBFS 2.x extension used by some operators: { mechanical, ebike }.
      const types = station.num_bikes_available_types;
      mechanical = count(types.mechanical);
      electric = count(types.ebike ?? types.electrical);
    } else {
      mechanical = bikes;
    }
    result.set(String(station.station_id), {
      bikes: Math.max(bikes, mechanical + electric),
      mechanical,
      electric,
      docks: count(station.num_docks_available),
      inService:
        station.is_installed !== false &&
        station.is_installed !== 0 &&
        station.is_renting !== false &&
        station.is_renting !== 0,
      reportedAt: Number.isFinite(station.last_reported) ? station.last_reported * 1000 : null,
    });
  }
  return result;
}

export class Gbfs {
  /**
   * @param {object} options
   * @param {typeof fetch} options.fetch
   * @param {string} [options.url] gbfs.json
   */
  constructor({ fetch, url = GBFS_URL }) {
    this.fetch = fetch;
    this.url = url;
    this.urls = null;
    this.kinds = new Map();
  }

  async discover() {
    if (!this.urls) {
      const urls = feedUrls(await getJson(this.fetch, this.url));
      if (!urls.station_information || !urls.station_status) {
        throw new HttpError('VélôToulouse: the GBFS discovery file lists no station feed');
      }
      if (urls.vehicle_types) {
        try {
          this.kinds = vehicleKinds(await getJson(this.fetch, urls.vehicle_types));
        } catch {
          // Optional: the ids "mechanical" / "electrical" speak for themselves.
        }
      }
      this.urls = urls;
    }
    return this.urls;
  }

  async stations() {
    const urls = await this.discover();
    return parseStations(await getJson(this.fetch, urls.station_information));
  }

  async status() {
    const urls = await this.discover();
    try {
      return parseStatus(await getJson(this.fetch, urls.station_status), this.kinds);
    } catch (err) {
      // The operator may move its feeds: discover them again next time.
      this.urls = null;
      throw err;
    }
  }
}
