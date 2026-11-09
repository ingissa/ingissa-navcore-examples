# `@ingissa/navcore-mapbox` API Reference

Complete API reference for `@ingissa/navcore-mapbox` (version 1.0.9).

---

## Classes

### `MapboxDirectionsProvider`
Implements NavCore's `DirectionsProvider` interface using the Mapbox Directions API.

```typescript
class MapboxDirectionsProvider implements DirectionsProvider {
  constructor(config: MapboxDirectionsConfig);
  getRoute(waypoints: Coordinate[], options?: DirectionsOptions): Promise<DirectionsResult>;
}
```

#### Waypoint Chunking
Mapbox enforces an upper limit of 25 waypoints per API request. When `waypoints.length > maxWaypointsPerChunk`, `MapboxDirectionsProvider` automatically splits the request into overlapping sub-routes using the `OVERLAP_1` algorithm, queries each chunk, and stitches the resulting geometry into a unified route polyline.

---

## Configuration

### `MapboxDirectionsConfig`
```typescript
interface MapboxDirectionsConfig {
  /** Mapbox access token (required) */
  accessToken: string;
  /** Routing profile (default: 'driving') */
  profile?: 'driving' | 'driving-traffic' | 'cycling' | 'walking';
  /** API base URL (default: 'https://api.mapbox.com') */
  baseUrl?: string;
  /** Maximum waypoints per API request chunk (default: 25) */
  maxWaypointsPerChunk?: number;
}
```