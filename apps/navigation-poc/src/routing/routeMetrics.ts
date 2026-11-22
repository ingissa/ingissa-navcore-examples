import type { Coordinate, NeutralRoute } from '../navigation/types.ts';

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b[1] - a[1]);
  const longitudeDelta = toRadians(b[0] - a[0]);
  const latitudeA = toRadians(a[1]);
  const latitudeB = toRadians(b[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function distanceToPolyline(point: Coordinate, geometry: readonly Coordinate[]): number {
  if (geometry.length === 0) {
    throw new Error('Cannot measure distance to an empty route geometry.');
  }
  if (geometry.length === 1) {
    return distanceBetween(point, geometry[0]);
  }

  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos((point[1] * Math.PI) / 180);
  let minimumDistance = Number.POSITIVE_INFINITY;
  const pointX = point[0] * longitudeScale;
  const pointY = point[1] * latitudeScale;

  for (let index = 1; index < geometry.length; index += 1) {
    const start = geometry[index - 1];
    const end = geometry[index];
    const startX = start[0] * longitudeScale - pointX;
    const startY = start[1] * latitudeScale - pointY;
    const segmentX = (end[0] - start[0]) * longitudeScale;
    const segmentY = (end[1] - start[1]) * latitudeScale;
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    const projection = segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, -(startX * segmentX + startY * segmentY) / segmentLengthSquared),
        );
    const distance = Math.hypot(
      startX + projection * segmentX,
      startY + projection * segmentY,
    );
    minimumDistance = Math.min(minimumDistance, distance);
  }

  return minimumDistance;
}

export function bearingBetween(a: Coordinate, b: Coordinate): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  const longitudeDelta = toRadians(b[0] - a[0]);
  const latitudeA = toRadians(a[1]);
  const latitudeB = toRadians(b[1]);
  const y = Math.sin(longitudeDelta) * Math.cos(latitudeB);
  const x =
    Math.cos(latitudeA) * Math.sin(latitudeB) -
    Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(longitudeDelta);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function getRouteMetrics(geometry: Coordinate[]) {
  const cumulativeMeters = [0];
  for (let index = 1; index < geometry.length; index += 1) {
    cumulativeMeters.push(
      cumulativeMeters[index - 1] + distanceBetween(geometry[index - 1], geometry[index]),
    );
  }

  return {
    cumulativeMeters,
    totalMeters: cumulativeMeters[cumulativeMeters.length - 1] ?? 0,
  };
}

export function routeProgress(route: NeutralRoute, geometryIndex: number) {
  const metrics = getRouteMetrics(route.geometry);
  const index = Math.max(0, Math.min(Math.floor(geometryIndex), route.geometry.length - 1));
  const distanceMeters = metrics.cumulativeMeters[index] ?? 0;

  return {
    distanceMeters,
    fraction: metrics.totalMeters > 0 ? distanceMeters / metrics.totalMeters : 0,
    percent: metrics.totalMeters > 0 ? (distanceMeters / metrics.totalMeters) * 100 : 0,
  };
}

export function sampleRouteAtDistance(geometry: Coordinate[], distanceMeters: number) {
  const metrics = getRouteMetrics(geometry);
  if (geometry.length === 0) {
    throw new Error('Cannot sample an empty route.');
  }
  if (geometry.length === 1 || distanceMeters <= 0) {
    return { coordinate: geometry[0], bearing: bearingBetween(geometry[0], geometry[1] ?? geometry[0]) };
  }

  const target = Math.min(distanceMeters, metrics.totalMeters);
  for (let index = 1; index < geometry.length; index += 1) {
    const segmentStart = metrics.cumulativeMeters[index - 1];
    const segmentLength = metrics.cumulativeMeters[index] - segmentStart;
    if (target <= metrics.cumulativeMeters[index]) {
      const ratio = segmentLength > 0 ? (target - segmentStart) / segmentLength : 0;
      const from = geometry[index - 1];
      const to = geometry[index];
      return {
        coordinate: [
          from[0] + (to[0] - from[0]) * ratio,
          from[1] + (to[1] - from[1]) * ratio,
        ] as Coordinate,
        bearing: bearingBetween(from, to),
      };
    }
  }

  const last = geometry.length - 1;
  return {
    coordinate: geometry[last],
    bearing: bearingBetween(geometry[last - 1], geometry[last]),
  };
}
