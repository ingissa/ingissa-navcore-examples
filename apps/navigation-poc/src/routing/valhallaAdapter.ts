import type { Coordinate, NeutralRoute, RouteInstruction } from '../navigation/types.ts';
import { RoutingError } from '../navigation/types.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RoutingError('invalid_response', `Valhalla response has an invalid ${label}.`);
  }
  return value;
}

function sameCoordinate(a: Coordinate, b: Coordinate) {
  return Math.abs(a[0] - b[0]) < 1e-8 && Math.abs(a[1] - b[1]) < 1e-8;
}

export function decodePolyline6(encoded: string): Coordinate[] {
  if (!encoded) {
    throw new RoutingError('invalid_response', 'Valhalla returned an empty route shape.');
  }

  let cursor = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates: Coordinate[] = [];

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      if (cursor >= encoded.length || shift > 30) {
        throw new RoutingError('invalid_response', 'Valhalla returned a malformed route shape.');
      }
      byte = encoded.charCodeAt(cursor) - 63;
      cursor += 1;
      if (byte < 0 || byte > 63) {
        throw new RoutingError('invalid_response', 'Valhalla returned a malformed route shape.');
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (cursor < encoded.length) {
    latitude += readDelta();
    longitude += readDelta();
    const coordinate: Coordinate = [longitude / 1_000_000, latitude / 1_000_000];
    if (
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1]) ||
      Math.abs(coordinate[0]) > 180 ||
      Math.abs(coordinate[1]) > 90
    ) {
      throw new RoutingError('invalid_response', 'Valhalla returned coordinates outside valid bounds.');
    }
    coordinates.push(coordinate);
  }

  if (coordinates.length < 2) {
    throw new RoutingError('invalid_response', 'Valhalla route must contain at least two points.');
  }

  return coordinates;
}

export function normalizeValhallaRoute(payload: unknown): NeutralRoute {
  const rawTrip = isRecord(payload) ? payload.trip : null;
  if (!isRecord(rawTrip) || !Array.isArray(rawTrip.legs)) {
    throw new RoutingError('invalid_response', 'Valhalla response is missing trip legs.');
  }

  const trip = rawTrip;
  const legs = rawTrip.legs;
  const geometry: Coordinate[] = [];
  const instructions: RouteInstruction[] = [];
  let summedLengthKilometers = 0;
  let summedDurationSeconds = 0;

  for (const rawLeg of legs) {
    if (!isRecord(rawLeg) || typeof rawLeg.shape !== 'string') {
      throw new RoutingError('invalid_response', 'Valhalla response contains a leg without a shape.');
    }
    const legGeometry = decodePolyline6(rawLeg.shape);
    const skipFirstPoint =
      geometry.length > 0 && sameCoordinate(geometry[geometry.length - 1], legGeometry[0]);
    const geometryOffset = skipFirstPoint ? geometry.length - 1 : geometry.length;

    for (let index = skipFirstPoint ? 1 : 0; index < legGeometry.length; index += 1) {
      geometry.push(legGeometry[index]);
    }

    if (typeof rawLeg.length === 'number' && Number.isFinite(rawLeg.length)) {
      summedLengthKilometers += rawLeg.length;
    }
    if (typeof rawLeg.time === 'number' && Number.isFinite(rawLeg.time)) {
      summedDurationSeconds += rawLeg.time;
    }

    if (Array.isArray(rawLeg.maneuvers)) {
      for (const rawManeuver of rawLeg.maneuvers) {
        if (!isRecord(rawManeuver)) {
          continue;
        }
        const localIndex = rawManeuver.begin_shape_index;
        if (
          typeof localIndex !== 'number' ||
          !Number.isInteger(localIndex) ||
          localIndex < 0 ||
          localIndex >= legGeometry.length
        ) {
          continue;
        }

        const geometryIndex = geometryOffset + localIndex;
        const type = rawManeuver.type;
        instructions.push({
          coordinate: geometry[geometryIndex] ?? legGeometry[localIndex],
          geometryIndex,
          text:
            (typeof rawManeuver.instruction === 'string' && rawManeuver.instruction) ||
            (typeof rawManeuver.verbal_transition_alert_instruction === 'string' &&
              rawManeuver.verbal_transition_alert_instruction) ||
            'Continue',
          maneuverType:
            typeof type === 'number'
              ? `valhalla:${type}`
              : typeof type === 'string'
                ? type
                : 'unknown',
        });
      }
    }
  }

  if (geometry.length < 2) {
    throw new RoutingError('invalid_response', 'Valhalla route must contain at least two points.');
  }

  const summary = isRecord(trip.summary) ? trip.summary : null;
  const lengthKilometers =
    summary && typeof summary.length === 'number'
      ? requiredNumber(summary.length, 'trip summary length')
      : summedLengthKilometers;
  const durationSeconds =
    summary && typeof summary.time === 'number'
      ? requiredNumber(summary.time, 'trip summary time')
      : summedDurationSeconds;

  return {
    geometry,
    distanceMeters: lengthKilometers * 1000,
    durationSeconds,
    instructions,
  };
}
