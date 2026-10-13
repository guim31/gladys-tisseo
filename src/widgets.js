// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
// - departures: the board of one watched stop — a status row per line and
//   direction ("A → Basso Cambo" / "3 · 7 min"), green when the vehicle is
//   tracked in real time, grey with "≈" for a timetable time; the heading is
//   the stop, the caption its disruptions (or the legend).
// - bike_stations: one station as live tiles (bikes, mechanical, electric,
//   docks), several as a status row each.
//
// Budget of the core: 8 components, 2 texts, 1 status (10 rows), 6 tiles.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { BIKE_KEYS, clip, lineLabel } from './devices.js';
import { NAMES, TEXT, say } from './messages.js';

export const MAX_ROWS = 10;
const MAX_LABEL = 40;

const t = (language, key, params) => say(TEXT, language, key, params);

/** "≈ 3 · 7 min", "0 min", "—". */
export function departureValue(group) {
  const [next, following] = group.departures;
  if (!next) {
    return '—';
  }
  const mark = next.realtime ? '' : '≈ ';
  const minutes = following ? `${next.minutes} · ${following.minutes}` : `${next.minutes}`;
  return `${mark}${minutes} min`;
}

function departuresContent(service, { settings, language }) {
  const ttl = Math.max(30, service.config.refreshSeconds);
  if (!settings?.stop) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'pickStop') }] };
  }
  const found = service.boardOf(settings.stop);
  if (!found) {
    const key = service.stopOfDevice(settings.stop) ? 'loading' : 'gone';
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, key) }] };
  }
  const { stop, board } = found;
  // Lines with a departure first (in their natural order), then the others.
  const rows = [
    ...board.filter((group) => group.departures.length > 0),
    ...board.filter((group) => group.departures.length === 0),
  ].slice(0, MAX_ROWS);
  const disruptions = service.trafficOf(stop);
  const components = [
    { type: 'text', variant: 'heading', text: clip(stop.name, 40) },
    {
      type: 'text',
      variant: 'caption',
      text:
        disruptions.length > 0
          ? clip(`⚠ ${disruptions.map((alert) => alert.title).join(' · ')}`, 80)
          : t(language, 'legend'),
    },
  ];
  if (rows.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(language, 'noDeparture') });
  } else {
    components.push({
      type: 'status',
      items: rows.map((group) => ({
        label: clip(
          `${lineLabel(group.route, language)} → ${group.departures[0]?.headsign ?? group.headsign}`,
          MAX_LABEL,
        ),
        value: departureValue(group),
        color:
          group.departures.length === 0
            ? WIDGET_COLORS.NEUTRAL
            : group.departures[0].realtime
              ? WIDGET_COLORS.SUCCESS
              : WIDGET_COLORS.INFO,
      })),
    });
  }
  return { ttl_seconds: ttl, components };
}

/** "3 méca · 2 élec · 12 places" (40 characters at most). */
export function stationValue(status, language) {
  if (!status.inService) {
    return t(language, 'outOfService');
  }
  return clip(
    `${status.mechanical} ${t(language, 'mechanicalShort')} · ${status.electric} ${t(language, 'electricShort')} · ${status.docks} ${t(language, 'docksShort')}`,
    40,
  );
}

function stationColor(status) {
  if (!status.inService) {
    return WIDGET_COLORS.NEUTRAL;
  }
  if (status.bikes === 0) {
    return WIDGET_COLORS.DANGER;
  }
  return status.bikes <= 2 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

function bikeContent(service, { settings, language }) {
  const ttl = Math.max(30, service.config.refreshSeconds);
  const chosen = Array.isArray(settings?.stations) ? settings.stations : [];
  const stations =
    chosen.length > 0
      ? chosen.map((id) => service.stationOfDevice(id)).filter(Boolean)
      : service.watch.stations;
  const shown = stations.slice(0, MAX_ROWS);
  if (shown.length === 0) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'pickStation') }] };
  }
  if (shown.length === 1) {
    const [station] = shown;
    const names = NAMES[language] ?? NAMES.en;
    const deviceId = service.stationDeviceId(station);
    const components = [{ type: 'text', variant: 'heading', text: clip(station.name, 40) }];
    if (service.isCreated(deviceId)) {
      for (const key of BIKE_KEYS) {
        components.push({
          type: 'value',
          label: clip(names[key], 24),
          icon: key === 'docks' ? 'log-in' : key === 'electric' ? 'zap' : 'disc',
          device_feature: `${deviceId}:${key}`,
        });
      }
      return { ttl_seconds: ttl, components };
    }
  }
  return {
    ttl_seconds: ttl,
    components: [
      {
        type: 'status',
        items: shown.map((station) => {
          const status = service.bikeStatus.get(station.id);
          return {
            label: clip(station.name, MAX_LABEL),
            value: status ? stationValue(status, language) : '—',
            color: status ? stationColor(status) : WIDGET_COLORS.NEUTRAL,
          };
        }),
      },
    ],
  };
}

export const WIDGETS = {
  departures: { get: departuresContent },
  bike_stations: { get: bikeContent },
};
