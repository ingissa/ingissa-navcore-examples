# Getting Started

## Installation

```bash
# Core engine â€” required for everything
npm install @ingissa/navcore-core

# Directions (choose what matches your stack)
# Option A: Mapbox API (requires token)
npm install @ingissa/navcore-mapbox

# Option B: Self-hosted / free (built into @ingissa/navcore-core â€” no extra install)
# OSRMDirectionsProvider, ValhallaDirectionsProvider, OpenRouteServiceProvider

# Renderer (choose one)
npm install @ingissa/navcore-maplibre      # Web â€” MapLibre GL JS
npm install @ingissa/navcore-leaflet       # Web â€” Leaflet.js
npm install @ingissa/navcore-google-maps   # Web â€” Google Maps API
npm install @ingissa/navcore-headless      # Node.js / testing
```

---

## Step 1: Get a Route

```typescript
import { OSRMDirectionsProvider } from '@ingissa/navcore-core';

const provider = new OSRMDirectionsProvider({
  baseUrl: 'http://router.project-osrm.org', // or your self-hosted instance
});

const result = await provider.getRoute([
  [2.3522, 48.8566],  // start [lng, lat]
  [2.3009, 48.8741],  // end
]);

console.log(result.geometry.length, 'waypoints');
console.log(result.distance, 'metres');
console.log(result.duration, 'seconds');
```

## Step 2: Create the Engine

```typescript
import { NavCore } from '@ingissa/navcore-core';

const engine = new NavCore({
  isDev: true,  // use in development â€” remove in production and add licenseKey
});
```

## Step 3: Load Route and Start

```typescript
engine.setRoute(result.geometry);
engine.startNavigation();
```

## Step 4: Subscribe to Events

```typescript
engine.on('instruction', (instr) => {
  console.log('Instruction:', instr.text);
});

engine.on('arrival', () => {
  console.log('Arrived!');
});

engine.on('deviation', ({ anchorIndex }) => {
  console.log('Off route at segment', anchorIndex);
});
```

## Step 5: Feed GPS Updates

```typescript
// Browser
navigator.geolocation.watchPosition(({ coords }) => {
  const state = engine.update({
    coord: [coords.longitude, coords.latitude],
    accuracy: coords.accuracy,
    bearing: coords.heading,
    speed: coords.speed ?? 0,
    timestamp: Date.now(),
  });

  console.log('Remaining:', state.distanceToDestination, 'm');
});

// React Native (expo-location)
await Location.watchPositionAsync({ accuracy: Location.Accuracy.High }, (loc) => {
  engine.update({
    coord: [loc.coords.longitude, loc.coords.latitude],
    accuracy: loc.coords.accuracy,
    bearing: loc.coords.heading,
    speed: loc.coords.speed ?? 0,
    timestamp: loc.timestamp,
  });
});
```

## Step 6: Add a Renderer (optional)

```typescript
import maplibregl from 'maplibre-gl';
import { MapLibreAdapter } from '@ingissa/navcore-maplibre';

const map = new maplibregl.Map({ container: 'map', style: '...' });
const adapter = new MapLibreAdapter(map);

map.on('load', () => {
  adapter.drawRoute(result.geometry);
});

// Wire up adapter on every tick
navigator.geolocation.watchPosition(({ coords }) => {
  const state = engine.update({ /* ... */ });
  if (state.snappedCoord) {
    adapter.updateVehicle(state.snappedCoord, state.bearing, state);
    adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 15 });
  }
});
```

## Step 7: Cleanup

```typescript
// On component unmount / navigation end
adapter.destroy();
engine.destroy();
```

---

## Development Mode vs Production

In `isDev: true` mode:
- All licensed features are unlocked
- A warning is logged to console on each `update()` call
- No license validation is performed

In production, set `isDev: false` and provide a `licenseKey`:

```typescript
const engine = new NavCore({ licenseKey: 'your-commercial-key' });
```

---

## TypeScript Types

All types are exported from `@ingissa/navcore-core`:

```typescript
import type {
  Coordinate,          // [lng, lat] tuple
  NavGpsUpdate,        // Input to engine.update()
  NavCoreState,        // Output of engine.update()
  NavInstruction,      // Instruction object
  DirectionsProvider,  // Provider interface
  DirectionsResult,    // Route result
  MapRendererAdapter,  // Renderer interface
  RouteStyle,          // Route line style
  CameraOptions,       // Camera pan options
} from '@ingissa/navcore-core';
```

---

## React Native Integration

```typescript
// In a React Native component (with expo-location)
import { useEffect, useRef } from 'react';
import { NavCore } from '@ingissa/navcore-core';
import * as Location from 'expo-location';

export function useNavCore() {
  const engineRef = useRef(new NavCore({ isDev: true }));

  useEffect(() => {
    const engine = engineRef.current;
    let subscription: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000 },
        (loc) => {
          engine.update({
            coord: [loc.coords.longitude, loc.coords.latitude],
            accuracy: loc.coords.accuracy,
            bearing: loc.coords.heading,
            speed: loc.coords.speed ?? 0,
            timestamp: loc.timestamp,
          });
        }
      );
    })();

    return () => {
      subscription?.remove();
      engine.destroy();
    };
  }, []);

  return engineRef.current;
}
```
