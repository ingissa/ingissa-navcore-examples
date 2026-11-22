import type {
  Coordinate,
  NeutralRoute,
  RouteRequest,
  RoutingProvider,
} from '../navigation/types.ts';
import { RoutingError } from '../navigation/types.ts';
import { distanceBetween, getRouteMetrics } from './routeMetrics.ts';
import { normalizeValhallaRoute } from './valhallaAdapter.ts';
import { valhallaFixture } from './valhallaFixture.ts';

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RoutingError('cancelled', 'Route request was cancelled.');
  }
}

async function valhallaErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string' &&
      payload.error.trim()
    ) {
      return payload.error.trim();
    }
  } catch {
    // Some reverse proxies return an HTML or empty error body. The HTTP status
    // remains useful in that case, so do not turn it into a JSON error.
  }
  return undefined;
}

export class ValhallaClient implements RoutingProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 12_000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async route({ origin, destination, signal }: RouteRequest): Promise<NeutralRoute> {
    if (!this.baseUrl.trim()) {
      throw new RoutingError('configuration', 'Set EXPO_PUBLIC_VALHALLA_URL to use Valhalla routing.');
    }
    ensureNotAborted(signal);

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const baseUrl = this.baseUrl.replace(/\/+$/, '');
    const endpoint = /\/route$/i.test(baseUrl) ? baseUrl : `${baseUrl}/route`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          locations: [
            { lon: origin[0], lat: origin[1] },
            { lon: destination[0], lat: destination[1] },
          ],
          costing: 'auto',
          units: 'kilometers',
          shape_format: 'polyline6',
          directions_options: { units: 'kilometers' },
        }),
      });

      if (!response.ok) {
        const detail = await valhallaErrorMessage(response);
        throw new RoutingError(
          'http',
          `Valhalla returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`,
          response.status,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new RoutingError('invalid_response', 'Valhalla returned invalid JSON.');
      }
      return normalizeValhallaRoute(payload);
    } catch (error) {
      if (error instanceof RoutingError) {
        throw error;
      }
      if (timedOut) {
        throw new RoutingError('timeout', `Valhalla request timed out after ${this.timeoutMs} ms.`);
      }
      if (signal?.aborted) {
        throw new RoutingError('cancelled', 'Route request was cancelled.');
      }
      throw new RoutingError('network', 'Could not reach the Valhalla server.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

export class FixtureRoutingProvider implements RoutingProvider {
  private readonly fixtureRoute = normalizeValhallaRoute(valhallaFixture);

  async route({ origin, signal }: RouteRequest): Promise<NeutralRoute> {
    ensureNotAborted(signal);
    const geometry = this.fixtureRoute.geometry;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    geometry.forEach((coordinate, index) => {
      const distance = distanceBetween(origin, coordinate);
      if (distance < closestDistance) {
        closestIndex = index;
        closestDistance = distance;
      }
    });

    const routeGeometry = [origin, ...geometry.slice(closestIndex + 1)];
    if (routeGeometry.length < 2) {
      routeGeometry.push(geometry[geometry.length - 1]);
    }
    const instructions = this.fixtureRoute.instructions
      .filter((instruction) => instruction.geometryIndex >= closestIndex)
      .map((instruction) => ({
        ...instruction,
        geometryIndex: instruction.geometryIndex - closestIndex,
      }));
    const distanceMeters = getRouteMetrics(routeGeometry).totalMeters;
    const durationSeconds =
      this.fixtureRoute.distanceMeters > 0
        ? this.fixtureRoute.durationSeconds * (distanceMeters / this.fixtureRoute.distanceMeters)
        : this.fixtureRoute.durationSeconds;

    return {
      ...this.fixtureRoute,
      geometry: routeGeometry,
      distanceMeters,
      durationSeconds,
      instructions,
    };
  }
}

export function createRoutingProvider(mode: string | undefined, baseUrl: string | undefined) {
  if (mode === 'fixture') {
    return new FixtureRoutingProvider();
  }
  return new ValhallaClient(baseUrl ?? '');
}

export function lastCoordinate(route: NeutralRoute): Coordinate {
  return route.geometry[route.geometry.length - 1];
}
