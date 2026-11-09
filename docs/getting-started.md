# Getting Started with NavCore

This guide gets you up and running with turn-by-turn navigation using NavCore 1.0.9.

---

## 1. Installation

Install `@ingissa/navcore-core`:

```bash
npm install @ingissa/navcore-core
```

For React Native applications:
```bash
npm install @ingissa/navcore-core @ingissa/navcore-react-native
```

For Mapbox routing:
```bash
npm install @ingissa/navcore-core @ingissa/navcore-mapbox
```

> [!NOTE]
> All public packages in NavCore 1.0.9 require `@ingissa/navcore-core: ^1.0.9`. Ensure all installed NavCore packages share the identical `1.0.9` version.

---

## 2. High-Level Integration: `NavigationSession`

`NavigationSession` is the recommended application-facing API. It automates:
1. Fetching route geometry and maneuver steps from a `DirectionsProvider`.
2. Normalizing raw API steps into route-projected `NavInstruction` entries via `createRoutePlan`.
3. Loading the engine and managing the navigation lifecycle.
4. Emitting typed events on every update tick.

### Initialize the Session

```typescript
import {
  createNavigationSession,
  OSRMDirectionsProvider,
} from '@ingissa/navcore-core';

// Use self-hosted OSRM or the public demo endpoint
const provider = new OSRMDirectionsProvider({
  baseUrl: 'https://router.project-osrm.org',
});

const nav = createNavigationSession({
  provider,
  providerName: 'osrm',
  engineOptions: {
    isDev: true, // Development mode: unlocks all features without a license key
  },
});
```

---

## 3. Starting Navigation

You can initiate a route in either of two ways:

### Option A: Origin & Destination (Two Points)

```typescript
await nav.navigate({
  origin: [2.3522, 48.8566],      // [lng, lat]
  destination: [2.3009, 48.8741], // [lng, lat]
  waypoints: [[2.3300, 48.8650]], // Optional intermediate stops
});
```

### Option B: Ordered Routing Waypoints

```typescript
await nav.navigate({
  coordinates: [
    [2.3522, 48.8566], // Origin
    [2.3300, 48.8650], // Checkpoint
    [2.3009, 48.8741], // Destination
  ],
});
```

> [!IMPORTANT]
> `coordinates` passed to `nav.navigate()` are **routing waypoints** sent to the routing engine. They are not precomputed line coordinates. If you already have precomputed geometry, see [Advanced: Direct `NavCore` Pipeline](#advanced-direct-navcore-pipeline).

---

## 4. Subscribing to Typed Events

`NavigationSession.subscribe()` registers event handlers and returns an unsubscribe callback:

```typescript
// Turn-by-turn maneuver instruction triggered
const unsubscribeInstruction = nav.subscribe('instruction', (instr) => {
  console.log('Upcoming Turn:', instr.text);
  console.log('Cumulative Offset (m):', instr.cumulativeOffset);
});

// Destination reached
const unsubscribeArrival = nav.subscribe('arrival', () => {
  console.log('🎉 Destination reached!');
});

// Off-route deviation alert
const unsubscribeDeviation = nav.subscribe('deviation', ({ anchorIndex, ghostCoord }) => {
  console.warn(`Off route near segment index ${anchorIndex}`);
});

// Vehicle returned to route
const unsubscribeRejoined = nav.subscribe('rejoined', ({ resumeIndex }) => {
  console.log(`Rejoined route at index ${resumeIndex}`);
});
```

---

## 5. Feeding GPS Fixes

Feed location updates from your browser geolocation or mobile location service directly into `nav.update(gps)`:

### Browser Geolocation

```typescript
const watchId = navigator.geolocation.watchPosition(
  ({ coords }) => {
    const state = nav.update({
      coord: [coords.longitude, coords.latitude],
      accuracy: coords.accuracy,
      bearing: coords.heading,
      speed: coords.speed ?? 0,
      timestamp: Date.now(),
    });

    console.log(`Distance to destination: ${Math.round(state.distanceToDestination ?? 0)} m`);
  },
  (err) => console.error('GPS error:', err),
  { enableHighAccuracy: true }
);
```

### React Native (`expo-location`)

```typescript
import * as Location from 'expo-location';

const subscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 1,
  },
  (loc) => {
    const state = nav.update({
      coord: [loc.coords.longitude, loc.coords.latitude],
      accuracy: loc.coords.accuracy,
      bearing: loc.coords.heading,
      speed: loc.coords.speed ?? 0,
      timestamp: loc.timestamp,
    });
  }
);
```

---

## 6. Rendering on Maps

NavCore does not bundle proprietary rendering controls; it leaves visual rendering to your map layer of choice (such as `react-native-maps`, `@rnmapbox/maps`, or MapLibre GL):

```typescript
// On every tick:
const state = nav.update(gpsFix);

if (state.snappedCoord) {
  // 1. Move vehicle marker to snapped coordinate
  vehicleMarker.setPosition({
    longitude: state.snappedCoord[0],
    latitude: state.snappedCoord[1],
  });
  
  // 2. Rotate vehicle marker or map camera to smoothed bearing
  vehicleMarker.setRotation(state.bearing);
}
```

To render the polyline, retrieve the immutable canonical geometry from the session's route plan:

```typescript
const plan = nav.getRoutePlan();
if (plan) {
  myMap.setPolylineCoordinates(plan.geometry);
}
```

---

## 7. Cleanup

When closing the navigation screen:

```typescript
unsubscribeInstruction();
unsubscribeArrival();
unsubscribeDeviation();
unsubscribeRejoined();
nav.destroy(); // Destroys session and owned engine instance
```

---

## Advanced: Direct `NavCore` Pipeline

Use the low-level `NavCore` engine when you have existing route geometry or require custom pipeline controls:

```typescript
import {
  NavCore,
  createRoutePlan,
  OSRMDirectionsProvider,
  type Coordinate,
} from '@ingissa/navcore-core';

// 1. Fetch raw routing result
const provider = new OSRMDirectionsProvider({ baseUrl: 'https://router.project-osrm.org' });
const rawRoute = await provider.getRoute([[2.3522, 48.8566], [2.3009, 48.8741]]);

// 2. Canonicalize with createRoutePlan (projects maneuvers onto segments)
const plan = createRoutePlan(rawRoute, { provider: 'osrm' });

// 3. Initialize engine
const engine = new NavCore({
  isDev: true,
  baseCorridorMeters: 25,
  maxCorridorMeters: 60,
  arrivalThresholdMeters: 30,
});

engine.loadRoute(plan);
engine.startNavigation();

// 4. Update on GPS ticks
const state = engine.update({
  coord: [2.3522, 48.8566],
  accuracy: 5,
  bearing: 180,
  speed: 10,
  timestamp: Date.now(),
});
```

---

## Next Steps

- Explore [Installation & Peer Dependencies](./installation.md) for bundler options and ESM/CJS subpaths.
- Review [Architecture & Pipeline Concepts](./concepts.md) for the 11 pipeline stages and state machines.
- Review [React Native Integration](./react-native.md) for tearing-free hook selectors.
- Review [Licensing](./licensing.md) for production license key specifications.