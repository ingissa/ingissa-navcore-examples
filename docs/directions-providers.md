# Directions Providers Guide

NavCore strictly separates **routing** (finding the path through road networks) from **turn-by-turn navigation** (tracking progress, snapping coordinates, and scheduling instruction cues). You choose your own routing backend without changing your core navigation logic.

---

## The `DirectionsProvider` Interface

All direction adapters in the NavCore ecosystem implement the `DirectionsProvider` interface defined in [`packages/core/src/directions/DirectionsProvider.ts`](file:///E:/WORKSPACE/expo_projects/navcore-sdk/packages/core/src/directions/DirectionsProvider.ts):

```typescript
export interface DirectionsProvider {
  getRoute(waypoints: Coordinate[], options?: DirectionsOptions): Promise<DirectionsResult>;
}
```

### Options (`DirectionsOptions`)
```typescript
export interface DirectionsOptions {
  profile?: 'driving' | 'cycling' | 'walking';
  steps?: boolean;
  language?: string;
  alternatives?: boolean;
}
```

### Result Contract (`DirectionsResult`)
```typescript
export interface DirectionsResult {
  geometry: Coordinate[]; // Ordered [lng, lat] coordinates
  distance: number;       // Total distance in metres
  duration: number;       // Total duration in seconds
  legs: DirectionsLeg[];  // Maneuvers and per-leg steps
  raw?: unknown;          // Underlying provider response for diagnostics
}
```

---

## Recommended: Using with `NavigationSession`

In standard applications, pass the directions provider to `createNavigationSession`. The session calls `getRoute()`, canonicalizes the maneuver points into an immutable `RoutePlan` with route-projected cumulative offsets, loads the engine, and initiates navigation:

```typescript
import {
  createNavigationSession,
  OSRMDirectionsProvider,
} from '@ingissa/navcore-core';

const nav = createNavigationSession({
  provider: new OSRMDirectionsProvider({
    baseUrl: 'https://router.project-osrm.org',
  }),
  providerName: 'osrm',
  engineOptions: { isDev: true },
});

// A. Navigate by origin and destination:
await nav.navigate({
  origin: [-6.84, 34.02],
  destination: [-6.80, 34.04],
  waypoints: [[-6.82, 34.03]], // Optional ordered stops
});

// B. Navigate through an ordered coordinate set:
await nav.navigate({
  coordinates: [
    [-6.84, 34.02],
    [-6.82, 34.03],
    [-6.80, 34.04],
  ],
});
```

> [!NOTE]
> `coordinates` passed to `nav.navigate()` are **routing waypoints** to be routed by the provider. They are not precomputed line coordinates. To supply precomputed geometry directly to the engine, use `engine.setRoute()` or `engine.loadRoute(plan)`.

---

## Built-In Providers (`@ingissa/navcore-core`)

The core package includes three ready-to-use providers with zero additional npm dependencies:

### 1. OSRM (`OSRMDirectionsProvider`)
Best for self-hosted, zero-API-cost deployments.
- **Package**: `@ingissa/navcore-core`
- **Config**:
  - `baseUrl: string`: Base URL of your OSRM backend (e.g. `http://localhost:5000` or demo `https://router.project-osrm.org`).
  - `profile?: 'driving' | 'cycling' | 'walking'` (default: `'driving'`).
  - `maxWaypointsPerChunk?: number` (default: `100`).

```typescript
import { OSRMDirectionsProvider } from '@ingissa/navcore-core';

const osrm = new OSRMDirectionsProvider({
  baseUrl: 'https://router.project-osrm.org',
  profile: 'driving',
});

const result = await osrm.getRoute([
  [2.3522, 48.8566],
  [2.3009, 48.8741],
]);
```

#### Self-Hosting OSRM with Docker
```bash
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/region.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/region.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/region.osrm
docker run -d -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/region.osrm
```

---

### 2. Valhalla (`ValhallaDirectionsProvider`)
Best for advanced routing costing models (pedestrian, bicycle, truck) and grade-aware routing.
- **Package**: `@ingissa/navcore-core`
- **Config**:
  - `baseUrl: string`: URL of the Valhalla server.
  - `costing?: 'auto' | 'bicycle' | 'pedestrian' | 'bus' | 'motor_scooter'` (default: `'auto'`).
  - `apiKey?: string`: Optional API token for hosted instances.
  - `maxWaypointsPerChunk?: number` (default: `50`).

```typescript
import { ValhallaDirectionsProvider } from '@ingissa/navcore-core';

const valhalla = new ValhallaDirectionsProvider({
  baseUrl: 'https://valhalla1.openstreetmap.de',
  costing: 'auto',
});

const result = await valhalla.getRoute([
  [2.3522, 48.8566],
  [2.3009, 48.8741],
]);
```

#### Self-Hosting Valhalla with Docker
```bash
docker run -dt --name valhalla \
  -p 8002:8002 \
  -v $PWD/custom_files:/custom_files \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest
```

---

### 3. OpenRouteService (`OpenRouteServiceProvider`)
Best for quick setup with a free cloud API key (2,000 free requests/day).
- **Package**: `@ingissa/navcore-core`
- **Config**:
  - `apiKey: string`: API key obtained from [openrouteservice.org](https://openrouteservice.org/).
  - `profile?: 'driving-car' | 'driving-hgv' | 'cycling-regular' | 'cycling-road' | 'cycling-mountain' | 'foot-walking' | 'foot-hiking' | 'wheelchair'` (default: `'driving-car'`).
  - `baseUrl?: string` (default: public ORS API).
  - `maxWaypointsPerChunk?: number` (default: `50`).

```typescript
import { OpenRouteServiceProvider } from '@ingissa/navcore-core';

const ors = new OpenRouteServiceProvider({
  apiKey: process.env.ORS_API_KEY!,
  profile: 'driving-car',
});
```

---

## Mapbox Directions (`@ingissa/navcore-mapbox`)

- **Package**: `@ingissa/navcore-mapbox`
- **Config**:
  - `accessToken: string`: Mapbox public or secret API token.
  - `profile?: 'driving' | 'driving-traffic' | 'cycling' | 'walking'` (default: `'driving'`).
  - `baseUrl?: string` (default: `https://api.mapbox.com`).
  - `maxWaypointsPerChunk?: number` (default: `25`, corresponding to Mapbox API limit).

```typescript
import { MapboxDirectionsProvider } from '@ingissa/navcore-mapbox';

const mapbox = new MapboxDirectionsProvider({
  accessToken: process.env.MAPBOX_ACCESS_TOKEN!,
  profile: 'driving-traffic',
});

const result = await mapbox.getRoute([
  [2.3522, 48.8566],
  [2.3009, 48.8741],
]);
```

---

## Waypoint Chunking & Stitching

Most hosted APIs enforce maximum waypoint counts per HTTP request (e.g., Mapbox limits calls to 25 waypoints).

All NavCore providers support chunking:
1. When `waypoints.length > maxWaypointsPerChunk`, the route is partitioned into overlapping chunks.
2. The `OVERLAP_1` boundary strategy ensures that chunk $N$ ends on the identical coordinate where chunk $N+1$ begins.
3. Chunks are queried sequentially or concurrently, duplicate boundary vertices are sliced, and the final polyline is seamlessly stitched into a unified `geometry`.

---

## Implementing a Custom Directions Provider

To connect an alternative routing engine (such as Google Directions, HERE, or GraphHopper), implement `DirectionsProvider`:

```typescript
import type {
  DirectionsProvider,
  DirectionsOptions,
  DirectionsResult,
  Coordinate,
} from '@ingissa/navcore-core';

export class CustomGraphHopperProvider implements DirectionsProvider {
  constructor(private readonly apiKey: string) {}

  async getRoute(waypoints: Coordinate[], options?: DirectionsOptions): Promise<DirectionsResult> {
    if (waypoints.length < 2) {
      throw new Error('[CustomGraphHopperProvider] At least two waypoints are required');
    }

    const pointParams = waypoints.map(([lng, lat]) => `point=${lat},${lng}`).join('&');
    const url = `https://graphhopper.com/api/1/route?${pointParams}&vehicle=car&points_encoded=false&key=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Routing failed with status ${res.status}`);
    const data = await res.json();
    const path = data.paths[0];

    return {
      geometry: path.points.coordinates, // Must be [lng, lat]
      distance: path.distance,
      duration: path.time / 1000,
      legs: [],
      raw: data,
    };
  }
}
```