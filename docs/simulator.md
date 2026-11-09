# Headless Simulator & Regression Testing Guide

`@ingissa/navcore-simulator` provides realistic GPS simulation for CI/CD test automation, algorithm verification, and React Native UI development without needing physical test drives.

---

## Architecture & Subpath Imports

The simulator package provides three subpath imports designed to prevent unwanted dependencies from leaking into CI or mobile builds:

| Subpath | Target Environment | Dependencies |
|---|---|---|
| `@ingissa/navcore-simulator` | Universal | Universal engine, utilities, and UI components |
| `@ingissa/navcore-simulator/node` | Node.js / CI / Vitest | Pure JavaScript/TypeScript. Zero DOM or React Native dependencies |
| `@ingissa/navcore-simulator/react-native` | React Native / Expo | Includes `useSimulator` hook and `SimulatorControls` UI component |

---

## Core Simulation Pipeline

The simulation system is composed of seven specialized modules:

### 1. `SimulatorEngine`
The stateful playback orchestrator:
- `start()`: Starts or resumes simulation at the current position.
- `pause()`: Freezes vehicle motion.
- `stop()`: Resets simulation to starting waypoint.
- `seek(geometryIndex: number)`: Jumps directly to any waypoint along the route polyline.
- `setSpeed(multiplier: 1 | 2 | 4 | 8)`: Sets time compression ratio (e.g. 4× real-time).
- `addScenario(scenario: Scenario)`: Injects scheduled road faults.
- `startRecording()` / `stopRecording()`: Captures emitted coordinates into a recorded `SimSession`.

### 2. `RouteWalker`
Calculates constant-velocity mathematical motion along a polyline. Interpolates intermediate coordinates, forward bearings, and cumulative distance along route segments.

### 3. `NoiseEngine`
Simulates realistic GNSS receiver errors using Gaussian random walks:
- `NoiseEngine.NONE`: Exact coordinates directly on the polyline ($\sigma = 0\text{m}$).
- `NoiseEngine.LOW`: High-precision dual-frequency GNSS ($\sigma = 4\text{m}$).
- `NoiseEngine.STANDARD`: Consumer smartphone GPS receiver in open/suburban sky ($\sigma = 12\text{m}$).
- `NoiseEngine.URBAN_CANYON`: Multipath reflection and tall building signal shadowing ($\sigma = 35\text{m}$).

### 4. `ScenarioInjector`
Schedules fault events to test engine resilience:
- `ScenarioInjector.gpsBlackout(index, durationMs)`: Suspends coordinate updates to emulate tunnels or satellite signal loss.
- `ScenarioInjector.accuracyDegradation(index, durationMs, accuracyM)`: Artificially degrades GPS accuracy bounds to test dynamic corridor expansion.
- `ScenarioInjector.speedSpike(index, durationMs, speedMultiplier)`: Accelerates vehicle motion to verify lookahead prediction.
- `ScenarioInjector.offRouteDrift(index, driftMeters, durationMs)`: Diverges the vehicle laterally away from the route corridor to trigger `DEVIATION_SUSPECTED` and `DEVIATION_CONFIRMED`.

### 5. `GpxParser`
Parses raw GPX XML strings into canonical coordinate arrays:
```typescript
import { GpxParser } from '@ingissa/navcore-simulator/node';

const parsed = GpxParser.parse(gpxXmlString);
console.log('Waypoints:', parsed.coordinates.length);
console.log('Total Distance (m):', parsed.totalDistance);
```

### 6. `SessionRecorder`
Records and exports test sessions into standardized JSON formats for deterministic replay in automated test harnesses.

### 7. `FleetSimulator`
Simulates multiple concurrent vehicles along independent routes to test telemetry ingest backends.

---

## Building Automated CI Regression Tests

Because `@ingissa/navcore-simulator/node` requires zero browser DOM or mobile runtime bindings, tests run at high speed in Vitest or Jest.

### Example: Testing Off-Route Detection & Recovery

```typescript
import { describe, it, expect } from 'vitest';
import { NavCore, type Coordinate } from '@ingissa/navcore-core';
import { SimulatorEngine, ScenarioInjector, NoiseEngine } from '@ingissa/navcore-simulator/node';

describe('Off-Route Regression Suite', () => {
  it('detects route deviation when lateral drift exceeds corridor', async () => {
    const route: Coordinate[] = [
      [2.3522, 48.8566],
      [2.3400, 48.8650],
      [2.3009, 48.8741],
    ];

    const engine = new NavCore({
      isDev: true,
      baseCorridorMeters: 25,
      maxCorridorMeters: 60,
    });
    engine.setRoute(route);
    engine.startNavigation();

    let offRouteTriggered = false;
    engine.on('deviation', () => {
      offRouteTriggered = true;
    });

    const sim = new SimulatorEngine({
      routeGeometry: route,
      speedKmh: 60,
      speedMultiplier: 8, // 8× fast-forward
      noiseProfile: NoiseEngine.NONE,
      onPositionUpdate: (pos) => {
        engine.update({
          coord: pos.coord,
          accuracy: pos.accuracy,
          bearing: pos.bearing,
          speed: pos.speed,
          timestamp: Date.now(),
        });
      },
    });

    // Inject a 100m lateral drift at waypoint index 1
    sim.addScenario(ScenarioInjector.offRouteDrift(1, 100, 4000));

    // Execute playback
    sim.start();

    // Verify state transition
    expect(engine.getState().offRouteState).toBeDefined();
  });
});
```

---

## React Native In-App Simulation Overlay

For interactive UI testing on mobile, mount the built-in control pane:

```tsx
import React from 'react';
import { View } from 'react-native';
import { useSimulator, SimulatorControls } from '@ingissa/navcore-simulator/react-native';
import { useNavCoreContext } from '@ingissa/navcore-react-native';

export function NavigationSimulatorScreen({ routeGeometry }) {
  const { engine: navCore } = useNavCoreContext();

  const { simulator, session, isRecording, currentSpeed, engineState } = useSimulator({
    routeGeometry,
    speedKmh: 50,
    onPositionUpdate: (pos) => {
      navCore.update({
        coord: pos.coord,
        accuracy: pos.accuracy,
        bearing: pos.bearing,
        speed: pos.speed,
        timestamp: Date.now(),
      });
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <SimulatorControls
        simulator={simulator}
        session={session}
        currentSpeed={currentSpeed}
        engineState={engineState}
        isRecording={isRecording}
      />
    </View>
  );
}
```