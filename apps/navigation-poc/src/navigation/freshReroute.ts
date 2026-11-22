import type { Coordinate, LocationSample, NeutralRoute, RoutingProvider } from './types.ts';
import { RoutingError } from './types.ts';
import { distanceBetween } from '../routing/routeMetrics.ts';

export const MAX_REROUTE_START_DISTANCE_METERS = 30;
export const MAX_STALE_REROUTE_RETRIES = 2;

export async function requestFreshReroute({
  provider,
  destination,
  getCurrentPosition,
  signal,
  maxStartDistanceMeters = MAX_REROUTE_START_DISTANCE_METERS,
  maxRetries = MAX_STALE_REROUTE_RETRIES,
  onRequest,
  onResponseReceived,
  onRouteDecoded,
  onDiscard,
}: {
  provider: RoutingProvider;
  destination: Coordinate;
  getCurrentPosition: () => LocationSample | null;
  signal: AbortSignal;
  maxStartDistanceMeters?: number;
  maxRetries?: number;
  onRequest?: (attempt: number, position: LocationSample) => void;
  onResponseReceived?: (attempt: number) => void;
  onRouteDecoded?: (attempt: number, route: NeutralRoute) => void;
  onDiscard?: (attempt: number, distanceMeters: number) => void;
}): Promise<NeutralRoute> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (signal.aborted) {
      throw new RoutingError('cancelled', 'Route request was cancelled.');
    }

    const requestPosition = getCurrentPosition();
    if (!requestPosition) {
      throw new RoutingError('invalid_response', 'Cannot request a reroute without a current position.');
    }
    onRequest?.(attempt + 1, requestPosition);

    const route = await provider.route({
      origin: requestPosition.coordinate,
      destination,
      signal,
    });
    onResponseReceived?.(attempt + 1);
    onRouteDecoded?.(attempt + 1, route);

    if (signal.aborted) {
      throw new RoutingError('cancelled', 'Route request was cancelled.');
    }

    const currentPosition = getCurrentPosition();
    if (!currentPosition) {
      throw new RoutingError('invalid_response', 'Cannot apply a reroute without a current position.');
    }

    const routeStart = route.geometry[0];
    if (!routeStart) {
      throw new RoutingError('invalid_response', 'Valhalla returned a route without a start coordinate.');
    }
    const startDistanceMeters = distanceBetween(routeStart, currentPosition.coordinate);
    if (startDistanceMeters <= maxStartDistanceMeters) {
      return route;
    }
    onDiscard?.(attempt + 1, startDistanceMeters);

    if (attempt === maxRetries) {
      throw new RoutingError(
        'invalid_response',
        `Valhalla reroute remained ${startDistanceMeters.toFixed(1)} m from the current position after ${maxRetries} retries.`,
      );
    }
  }

  throw new Error('Fresh reroute completed without a route.');
}
