# Directions Providers

NavCore separates **routing** from **navigation**. You choose your own routing backend.

## The `DirectionsProvider` Interface

Every provider implements the same single method:

```typescript
interface DirectionsProvider {
  getRoute(waypoints: Coordinate[], options?: DirectionsOptions): Promise<DirectionsResult>;
}
```

This means you can swap providers without touching your navigation code.

---

## Mapbox Directions (`@ingissa/navcore-mapbox`)

**Best for:** Production apps already using Mapbox. Requires an API key.

```typescript
import { MapboxDirectionsProvider } from '@ingissa/navcore-mapbox';

const provider = new MapboxDirectionsProvider({
  accessToken: 'pk.eyJ1...',
  profile: 'driving',          // 'driving' | 'driving-traffic' | 'cycling' | 'walking'
});

const route = await provider.getRoute(waypoints);
```

- Handles waypoint chunking automatically (Mapbox limit: 25 waypoints per call)
- Uses OVERLAP_1 strategy to stitch chunks seamlessly

---

## OSRM (`@ingissa/navcore-core` built-in)

**Best for:** Self-hosted, zero API cost. Open-source project OSRM.

```typescript
import { OSRMDirectionsProvider } from '@ingissa/navcore-core';

// Public demo server (rate-limited)
const provider = new OSRMDirectionsProvider({
  baseUrl: 'http://router.project-osrm.org',
  profile: 'driving',  // 'driving' | 'cycling' | 'walking'
});

// Self-hosted
const provider = new OSRMDirectionsProvider({
  baseUrl: 'http://localhost:5000',
  maxWaypointsPerChunk: 100,
});

const route = await provider.getRoute(waypoints);
```

### Self-hosting OSRM

```bash
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/france-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/france-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/france-latest.osrm
docker run -t -i -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/france-latest.osrm
```

---

## Valhalla (`@ingissa/navcore-core` built-in)

**Best for:** Advanced routing with costing models, traffic avoidance, multi-modal.

```typescript
import { ValhallaDirectionsProvider } from '@ingissa/navcore-core';

const provider = new ValhallaDirectionsProvider({
  baseUrl: 'https://valhalla1.openstreetmap.de',  // public instance
  costing: 'auto',   // 'auto' | 'bicycle' | 'pedestrian' | 'bus' | 'motor_scooter'
});

const route = await provider.getRoute(waypoints, { profile: 'cycling' });
```

- Automatically decodes Valhalla's polyline6 encoded geometry
- Supports chunking for long routes

### Self-hosting Valhalla

```bash
docker run -dt --name valhalla_gis-ops \
  -p 8002:8002 \
  -v $PWD/custom_files:/custom_files \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest build-config
```

---

## OpenRouteService (`@ingissa/navcore-core` built-in)

**Best for:** Free tier (2000 req/day), easy setup, 8 transport profiles.

```typescript
import { OpenRouteServiceProvider } from '@ingissa/navcore-core';

const provider = new OpenRouteServiceProvider({
  apiKey: 'your-ors-key',  // Get free at openrouteservice.org
  profile: 'driving-car',  // or: 'driving-hgv', 'cycling-regular', 'foot-walking', etc.
});

const route = await provider.getRoute(waypoints);
```

Get a free API key: [openrouteservice.org](https://openrouteservice.org/)

---

## Using with `CustomRouteBuilder`

For routes with many waypoints (> provider limit):

```typescript
import { CustomRouteBuilder, OSRMDirectionsProvider } from '@ingissa/navcore-core';

const builder = new CustomRouteBuilder();
// ... add waypoints

const provider = new OSRMDirectionsProvider({ baseUrl: '...' });
const chunks = builder.chunk('OVERLAP_1', 100); // split for provider

// Fetch all chunks in parallel
const results = await Promise.all(chunks.map(chunk => provider.getRoute(chunk)));

// Stitch geometry
const geometry = results.flatMap((r, i) => i === 0 ? r.geometry : r.geometry.slice(1));

engine.setRoute(geometry);
```

---

## Provider Comparison

| | Mapbox | OSRM | Valhalla | ORS |
|---|---|---|---|---|
| **Free tier** | 100k req/mo | Unlimited (self-host) | Unlimited (self-host) | 2000 req/day |
| **API key** | Required | No | Optional | Required |
| **Self-host** | No | Yes (Docker) | Yes (Docker) | Yes |
| **Traffic** |         (driving-traffic) |        |         (with data) |        |
| **Profiles** | 4 | 3 | 5 | 8 |
| **Turn instructions** |         |         |         |         |
