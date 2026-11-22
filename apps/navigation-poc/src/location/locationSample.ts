import type { LocationSample } from '../navigation/types.ts';

export interface DeviceLocationFix {
  coords: {
    longitude: number;
    latitude: number;
    accuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

function finiteOr(value: number | null, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function toLocationSample(location: DeviceLocationFix): LocationSample {
  const { coords, timestamp } = location;
  return {
    coordinate: [coords.longitude, coords.latitude],
    accuracyMeters: finiteOr(coords.accuracy, 0),
    bearing: finiteOr(coords.heading, 0),
    speedMetersPerSecond: Math.max(0, finiteOr(coords.speed, 0)),
    timestamp: finiteOr(timestamp, Date.now()),
  };
}
