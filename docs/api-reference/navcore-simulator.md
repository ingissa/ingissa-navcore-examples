# `@ingissa/navcore-simulator` API Reference

Complete API reference for `@ingissa/navcore-simulator` (version 1.0.9). Covers root, `/node`, and `/react-native` exports.

---

## 1. Engine & Playback

### `SimulatorEngine`
The central orchestrator for GPS route simulation.
```typescript
class SimulatorEngine {
  constructor(config: SimulatorConfig);
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  seek(geometryIndex: number): void;
  setSpeed(multiplier: 1 | 2 | 4 | 8): void;
  addScenario(scenario: Scenario): void;
  removeScenario(name: string): void;
  clearScenarios(): void;
  startRecording(sessionId?: string): void;
  stopRecording(): SimSession;
  readonly state: EngineState;
  readonly position: SimPosition | null;
  readonly progress: number;
}
```

### `SimulatorConfig`
```typescript
interface SimulatorConfig {
  routeGeometry: Coordinate[];
  speedKmh?: number;
  speedMultiplier?: 1 | 2 | 4 | 8;
  noiseProfile?: NoiseProfile;
  loop?: boolean;
  tickRateHz?: number;
  onPositionUpdate?: (pos: SimPosition) => void;
  onRouteComplete?: () => void;
}
```

### Associated Types
- `Coordinate`: `[number, number]`
- `EngineState`: `'idle' | 'running' | 'paused' | 'complete'`
- `SimPosition`: `{ coord: Coordinate; bearing: number; speed: number; accuracy: number; progress: number; index: number; timestamp: number }`
- `SimLocationObject`: Location object with coordinates and timestamp.
- `SimLocationCoords`: Coordinates and accuracy metrics.
- `VehicleProfile`: `{ maxSpeedKmh: number; accelerationMps2: number; decelerationMps2: number }`

---

## 2. Geometry & Noise Utilities

### `RouteWalker`
Calculates constant-velocity mathematical motion along a polyline:
```typescript
class RouteWalker {
  constructor(route: Coordinate[]);
  walk(distanceMetres: number): WalkerPosition;
  reset(): void;
}
interface WalkerPosition { coord: Coordinate; bearing: number; segmentIndex: number; distanceTraveled: number; isComplete: boolean; }
```

### `NoiseEngine`
Applies Gaussian noise perturbations:
```typescript
class NoiseEngine {
  constructor(profile: NoiseProfile);
  applyNoise(coord: Coordinate, bearing: number, speed: number): { coord: Coordinate; bearing: number; accuracy: number };
  static readonly NONE: NoiseProfile;
  static readonly LOW: NoiseProfile;
  static readonly STANDARD: NoiseProfile;
  static readonly URBAN_CANYON: NoiseProfile;
}
interface NoiseProfile { name: string; stdDevM: number; bearingStdDevDeg: number; accuracyMeanM: number; }
```

---

## 3. Scenarios & Fault Injection

### `ScenarioInjector`
Factory creating dynamic test anomalies:
```typescript
class ScenarioInjector {
  static gpsBlackout(triggerIndex: number, durationMs: number): Scenario;
  static accuracyDegradation(triggerIndex: number, durationMs: number, accuracyM: number): Scenario;
  static speedSpike(triggerIndex: number, durationMs: number, speedMultiplier: number): Scenario;
  static offRouteDrift(triggerIndex: number, driftMeters: number, durationMs: number): Scenario;
}
interface Scenario { name: string; triggerIndex: number; durationMs: number; apply: (pos: SimPosition) => SimPosition | null; }
interface ScenarioLogEntry { timestamp: number; name: string; type: string; details: string; }
```

---

## 4. GPX Parsing & Session Recording

### `GpxParser`
```typescript
class GpxParser {
  static parse(gpxXml: string): GpxParseResult;
}
interface GpxParseResult { coordinates: Coordinate[]; totalDistance: number; name?: string; }
```

### `SessionRecorder`
```typescript
class SessionRecorder {
  start(sessionId?: string): void;
  record(pos: SimPosition): void;
  stop(): SimSession;
  export(format: ExportFormat): string;
}
interface SimSession { id: string; startTime: number; endTime: number; positions: SimPosition[]; }
type ExportFormat = 'json' | 'csv' | 'gpx';
```

### `FleetSimulator`
```typescript
class FleetSimulator {
  addVehicle(id: string, config: SimulatorConfig): void;
  startAll(): void;
  stopAll(): void;
  getReport(): FleetReport;
}
interface FleetReport { activeVehicles: number; totalDistanceM: number; }
```

---

## 5. React Native UI Components

### `useSimulator`
```typescript
function useSimulator(options: UseSimulatorOptions): UseSimulatorResult;
```

### `SimulatorControls`
Control panel overlay component for interactive simulation playback in React Native applications:
```tsx
function SimulatorControls(props: SimulatorControlsProps): JSX.Element;
```