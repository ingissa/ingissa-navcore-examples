# React Native Integration Guide

`@ingissa/navcore-react-native` provides reactive bindings and performance-optimized state selectors for React Native and Expo applications.

---

## Architecture Overview

Traditional navigation SDKs bundle heavy native binaries that complicate builds, require custom native pods, and break in managed Expo Go environments.

NavCore's architecture is different:
- **Zero native binary modules**: The entire engine and React binding layer are pure TypeScript.
- **BYO Map Component**: NavCore does not impose a proprietary map view. You render vehicle markers, camera angles, and route geometry using standard community libraries like `react-native-maps` or `@rnmapbox/maps`.
- **Tearing-free selective subscriptions**: Built on React 18's `useSyncExternalStore`, UI elements only re-render when their specific observed slice of navigation state changes.

---

## Installation & Peer Dependencies

```bash
npm install @ingissa/navcore-react-native @ingissa/navcore-core
```

Ensure your project fulfills the peer dependency requirements:
- `@ingissa/navcore-core`: `^2.1.0`
- `react`: `>=18.0.0`
- `react-native`: `>=0.72.0`
- `react-native-maps`: `>=1.0.0` (optional)

---

## Providing the Engine Context (`NavCoreProvider`)

Wrap your navigation tree with `<NavCoreProvider>`. This initializes and maintains a single `NavCore` engine instance across child components.

```tsx
import React from 'react';
import { NavCoreProvider } from '@ingissa/navcore-react-native';
import { NavigationScreen } from './screens/NavigationScreen';

export default function App() {
  return (
    <NavCoreProvider
      options={{
        isDev: true, // Development mode only: unlocks Pro modules in non-production builds (ignored in production)
        baseCorridorMeters: 25,
        maxCorridorMeters: 60,
        arrivalThresholdMeters: 30,
      }}
    >
      <NavigationScreen />
    </NavCoreProvider>
  );
}
```

If multiple components need direct engine access, retrieve it via `useNavCoreContext()`:

```tsx
import { useNavCoreContext } from '@ingissa/navcore-react-native';

export function Controls() {
  const { engine } = useNavCoreContext();

  const handleStop = () => {
    engine.stopNavigation();
  };

  return <Button title="Cancel" onPress={handleStop} />;
}
```

---

## Granular State Selector Hooks

High-frequency GPS updates (1–10 Hz) cause severe performance degradation if components subscribe to the entire `NavCoreState` object. NavCore provides targeted selector hooks that isolate re-renders.

### 1. `useNavInstruction(customEngine?)`
Returns the upcoming turn-by-turn maneuver instruction, or `null`.
- **Re-render condition**: Only triggers when `nextInstructionIndex` changes or when instruction text changes.

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useNavInstruction } from '@ingissa/navcore-react-native';

export function InstructionBanner() {
  const instruction = useNavInstruction();
  if (!instruction) return null;

  return (
    <View style={{ position: 'absolute', top: 40, left: 16, right: 16, backgroundColor: '#222', padding: 16, borderRadius: 12 }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
        {instruction.text ?? instruction.instruction}
      </Text>
    </View>
  );
}
```

### 2. `useNavProgress(customEngine?)`
Returns structured distance metrics:
```typescript
interface NavProgressInfo {
  distanceToDestination: number | null;
  distanceToNextInstruction: number | null;
  progressIndex: number;
  routeIndex: number;
  hasArrived: boolean;
}
```
- **Re-render condition**: Triggers when remaining distance or route segment indices change.

```tsx
import { useNavProgress } from '@ingissa/navcore-react-native';

export function ProgressFooter() {
  const { distanceToDestination, distanceToNextInstruction, hasArrived } = useNavProgress();

  if (hasArrived) {
    return <Text>Destination reached!</Text>;
  }

  return (
    <View>
      <Text>In {Math.round(distanceToNextInstruction ?? 0)} m</Text>
      <Text>Remaining: {((distanceToDestination ?? 0) / 1000).toFixed(1)} km</Text>
    </View>
  );
}
```

### 3. `useNavAlert(customEngine?)`
Returns the current deviation/recalculation status:
`'NONE' | 'DEVIATING' | 'RECALCULATING' | 'REJOINING' | 'REJOINED'`
- **Re-render condition**: Only triggers on state transition changes.

```tsx
import { useNavAlert } from '@ingissa/navcore-react-native';

export function OffRouteBanner() {
  const alert = useNavAlert();

  if (alert === 'NONE') return null;

  return (
    <View style={{ backgroundColor: alert === 'RECALCULATING' ? 'red' : 'orange' }}>
      <Text>Status: {alert}</Text>
    </View>
  );
}
```

### 4. `useNavIsOffRoute(customEngine?)`
Boolean indicator: `true` if vehicle is deviating or off-route.

### 5. `useNavSpeed(customEngine?)`
Returns current ground speed in metres per second (`m/s`).

```tsx
import { useNavSpeed } from '@ingissa/navcore-react-native';

export function Speedometer() {
  const speedMps = useNavSpeed();
  const speedKmh = Math.round(speedMps * 3.6);

  return <Text>{speedKmh} km/h</Text>;
}
```

### 6. Custom Slices with `useNavSelector`
For arbitrary derived values, use `useNavSelector`:

```tsx
import { useNavSelector } from '@ingissa/navcore-react-native';

export function GpsQualityIndicator() {
  const isStale = useNavSelector((state) => state.isGpsStale);
  return <Text>{isStale ? '⚠️ Weak GPS' : '🟢 GPS Good'}</Text>;
}
```

---

## Map Rendering Patterns

Because NavCore outputs pure coordinates and heading angles, wiring to map views is straightforward.

### Pattern A: `react-native-maps`

```tsx
import React, { useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useNavSelector } from '@ingissa/navcore-react-native';

export function NavigationMap({ routeGeometry }) {
  const markerRef = useRef<any>(null);

  // Subscribe to snapped coordinates
  const snappedCoord = useNavSelector((s) => s.snappedCoord);
  const bearing = useNavSelector((s) => s.bearing);

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: routeGeometry[0][1],
        longitude: routeGeometry[0][0],
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
    >
      <Polyline
        coordinates={routeGeometry.map(([longitude, latitude]) => ({ latitude, longitude }))}
        strokeColor="#3b82f6"
        strokeWidth={5}
      />
      {snappedCoord && (
        <Marker
          ref={markerRef}
          coordinate={{ latitude: snappedCoord[1], longitude: snappedCoord[0] }}
          rotation={bearing}
          flat
          anchor={{ x: 0.5, y: 0.5 }}
        />
      )}
    </MapView>
  );
}
```

---

## Lifecycle & Feeding Location Fixes

To feed geolocation data, hook `Location.watchPositionAsync` (Expo) or `navigator.geolocation` directly to `engine.update`:

```tsx
import React, { useEffect } from 'react';
import * as Location from 'expo-location';
import { useNavCoreContext } from '@ingissa/navcore-react-native';

export function LocationTracker() {
  const { engine } = useNavCoreContext();

  useEffect(() => {
    let sub: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500 },
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
      sub?.remove();
    };
  }, [engine]);

  return null;
}
```