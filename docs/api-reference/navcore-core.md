# `@ingissa/navcore-core` API Reference

Complete API reference for `@ingissa/navcore-core` (version 1.0.9). Covers root, `/core`, and `/pro` exports.

---

## 1. High-Level Session API

### `createNavigationSession(options: NavigationSessionOptions): NavigationSession`
Creates an application-level navigation session that coordinates route fetching, maneuver projection, engine lifecycle, and typed subscriptions.

### `NavigationSession`
```typescript
class NavigationSession {
  readonly engine: NavCore;
  navigate(request: NavigationRequest): Promise<RoutePlan>;
  loadRoute(plan: RoutePlan, start?: boolean): void;
  update(gps: NavGpsUpdate): NavCoreState;
  tick(nowMs: number): NavCoreState;
  getState(): NavCoreState;
  getRoutePlan(): RoutePlan | null;
  subscribe<K extends keyof NavigationSessionEventMap>(
    event: K,
    handler: (payload: NavigationSessionEventMap[K]) => void
  ): () => void;
  destroy(): void;
}
```

### `NavigationSessionOptions`
```typescript
interface NavigationSessionOptions {
  provider: DirectionsProvider;
  providerName?: string;
  engine?: NavCore;
  engineOptions?: NavCoreOptions;
}
```

### `NavigationRequest`
Union of two routing request shapes:
- `OriginDestinationNavigationRequest`: `{ origin: Coordinate; destination: Coordinate; waypoints?: Coordinate[]; directions?: DirectionsOptions }`
- `CoordinatesNavigationRequest`: `{ coordinates: Coordinate[]; directions?: DirectionsOptions }`

### `NavigationSessionEventMap`
```typescript
interface NavigationSessionEventMap {
  routeLoaded: RoutePlan;
  navigationStarted: undefined;
  state: NavCoreState;
  instruction: NavInstruction;
  deviation: { anchorIndex: number; ghostCoord: Coordinate };
  rejoined: { resumeIndex: number };
  arrival: undefined;
}
```

---

## 2. Core Engine (`NavCore`)

### `NavCore`
The central orchestrator running the 11-stage navigation pipeline.
```typescript
class NavCore {
  constructor(options?: NavCoreOptions);
  setRoute(route: ReadonlyArray<Coordinate>, instructions?: ReadonlyArray<NavInstruction>): void;
  loadRoute(plan: RoutePlan): void;
  startNavigation(): void;
  stopNavigation(): void;
  update(gps: NavGpsUpdate): NavCoreState;
  tick(nowMs: number): NavCoreState;
  getState(): NavCoreState;
  getRoute(): ReadonlyArray<Coordinate>;
  getInstructions(): ReadonlyArray<NavInstruction>;
  getRoutePlan(): RoutePlan | null;
  getLicenseManager(): LicenseManager;
  getNavigationFSM(): NavigationFSM;
  getOffRouteFSM(): OffRouteFSM;
  destroy(): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
}
```

### `NavCoreOptions`
```typescript
interface NavCoreOptions {
  licenseKey?: string;
  isDev?: boolean;
  isCircuit?: boolean;
  kalmanQ?: number;
  kalmanRBase?: number;
  baseCorridorMeters?: number;
  maxCorridorMeters?: number;
  arrivalThresholdMeters?: number;
  bearingSmoothingAlpha?: number;
}
```

### `NavGpsUpdate`
```typescript
interface NavGpsUpdate {
  coord: Coordinate;
  accuracy: number | null;
  bearing: number | null;
  speed: number;
  timestamp: number;
}
```

### `NavCoreState`
```typescript
interface NavCoreState {
  snappedCoord: Coordinate | null;
  rawGpsCoord: Coordinate | null;
  bearing: number;
  routeIndex: number;
  distanceToRoute: number;
  corridor: number;
  isOffRoute: boolean;
  hasArrived: boolean;
  offRouteState: OffRouteState;
  lifecycleState: NavLifecycleState;
  distanceToDestination: number | null;
  distanceToNextInstruction: number | null;
  nextInstructionIndex: number | null;
  currentSpeed: number;
  isGpsStale: boolean;
  gpsAgeMs: number;
  alertState: 'NONE' | 'DEVIATING' | 'RECALCULATING' | 'REJOINING' | 'REJOINED';
  rejoinTarget: { coord: Coordinate; index: number } | null;
  licenseStatus: LicenseStatus;
}
```

---

## 3. Route Plan & Normalization

### `createRoutePlan(result: DirectionsResult, options?: CreateRoutePlanOptions): RoutePlan`
Normalizes provider-specific maneuver steps by projecting them onto the route polyline.

### `RoutePlan`
```typescript
interface RoutePlan {
  readonly geometry: ReadonlyArray<Coordinate>;
  readonly instructions: ReadonlyArray<NavInstruction>;
  readonly distanceM: number;
  readonly durationS: number;
  readonly providerDistanceM: number;
  readonly provider?: string;
}
```

### `CreateRoutePlanOptions`
```typescript
interface CreateRoutePlanOptions {
  provider?: string;
}
```

### `NavInstruction`
```typescript
interface NavInstruction {
  location: Coordinate;
  geometryIndex: number;
  cumulativeOffset?: number;
  bearingBefore?: number;
  bearingAfter?: number;
  text?: string;
  instruction?: string;
}
```

---

## 4. Directions Providers

### `DirectionsProvider`
```typescript
interface DirectionsProvider {
  getRoute(waypoints: Coordinate[], options?: DirectionsOptions): Promise<DirectionsResult>;
}
```

### `DirectionsOptions`
```typescript
interface DirectionsOptions {
  profile?: 'driving' | 'cycling' | 'walking';
  steps?: boolean;
  language?: string;
  alternatives?: boolean;
}
```

### `DirectionsResult`, `DirectionsLeg`, `DirectionsStep`, `DirectionsManeuver`
```typescript
interface DirectionsResult {
  geometry: Coordinate[];
  distance: number;
  duration: number;
  legs: DirectionsLeg[];
  raw?: unknown;
}
interface DirectionsLeg {
  distance: number;
  duration: number;
  steps?: DirectionsStep[];
}
interface DirectionsStep {
  distance: number;
  duration: number;
  geometry: Coordinate[];
  maneuver: DirectionsManeuver;
  name?: string;
}
interface DirectionsManeuver {
  type: string;
  modifier?: string;
  location: Coordinate;
  bearingBefore: number;
  bearingAfter: number;
  instruction?: string;
}
```

### Provider Implementations
- `OSRMDirectionsProvider`: Configured via `OSRMConfig` (`baseUrl`, `profile`, `maxWaypointsPerChunk`).
- `ValhallaDirectionsProvider`: Configured via `ValhallaConfig` (`baseUrl`, `costing`, `apiKey`, `maxWaypointsPerChunk`). Costing models: `ValhallaCostingModel` (`'auto' | 'bicycle' | 'pedestrian' | 'bus' | 'motor_scooter'`).
- `OpenRouteServiceProvider`: Configured via `ORSConfig` (`apiKey`, `profile`, `baseUrl`, `maxWaypointsPerChunk`). Profiles: `ORSProfile` (`'driving-car' | 'driving-hgv' | 'cycling-regular' | ...`).

---

## 5. Geometric Utilities & Math

- `Coordinate`: `[number, number]` in `[longitude, latitude]` order.
- `haversineDistance(lat1, lon1, lat2, lon2): number`: Distance in metres between two points.
- `geoGetBearing(lat1, lon1, lat2, lon2): number`: Initial azimuth heading in degrees (0–360°).
- `destinationPoint(lat, lon, distanceM, bearingDeg): Coordinate`: Dead-reckoned destination coordinate.
- `normalizeAngle(angle: number): number`: Normalizes angle to `[-180, 180]`.
- `getBearingBetweenPoints(start: Coordinate, end: Coordinate): number`: Heading angle between two coordinates.
- `interpolatePoint(a: Coordinate, b: Coordinate, t: number): Coordinate`: Linear interpolation along a segment.
- `projectPointOnSegment(p: Coordinate, a: Coordinate, b: Coordinate): Coordinate`: Closest projected point.
- `buildForwardCumulativeDistances(route: Coordinate[]): Float64Array`: Cumulative distances from start.
- `buildReverseCumulativeDistances(route: Coordinate[]): Float64Array`: Remaining distances to destination.
- `pointAtOffset(route: Coordinate[], cumulative: Float64Array, targetOffsetM: number): Coordinate`: Finds point along route at exact metric offset.

---

## 6. Snapping & Noise Filtering

### `KalmanFilter2D`
```typescript
class KalmanFilter2D {
  constructor(Q?: number, rBase?: number);
  init(lng: number, lat: number, timestamp: number): void;
  update(lng: number, lat: number, accuracy: number, timestamp: number): [number, number];
  getPosition(): [number, number];
  getState(): Kalman2DState;
  reset(): void;
}
function kalmanUpdate2D(state: Kalman2DState, measX: number, measY: number, accuracy: number, dt: number, Q?: number, rBase?: number): Kalman2DState;
interface Kalman2DState { x: number; y: number; vx: number; vy: number; P: number; }
```

### `RouteSnapper`
```typescript
class RouteSnapper {
  constructor(options?: SnapperOptions);
  snap(gps: Coordinate, route: Coordinate[], startIdx: number, windowSize: number, isCircuit: boolean, maxProgressIdx: number, fallbackIdx: number, vehicleBearing?: number | null, prevSegment?: number | null): SnapResult;
}
interface SnapperOptions { useBearingPenalty?: boolean; useInertiaPenalty?: boolean; maxSnapDistance?: number; }
interface SnapResult { idx: number; dist: number; proj: Coordinate; }
interface SnapCandidate { segmentIndex: number; distance: number; projection: Coordinate; score?: number; }
```

### `ParallelRoadResolver`
```typescript
class ParallelRoadResolver {
  constructor(options?: ParallelRoadResolverOptions);
  resolveBest(candidates: SnapCandidate[], vehicleBearing: number | null, prevSegmentIdx: number | null): ResolvedCandidate | null;
  resolve(candidates: SnapCandidate[], vehicleBearing: number | null, prevSegmentIdx: number | null): ResolvedCandidate[];
  isLikelyUTurn(vehicleBearing: number, segA: Coordinate, segB: Coordinate): boolean;
}
interface ParallelRoadResolverOptions { bearingPenalty?: number; inertiaPenalty?: number; inertiaSegmentThreshold?: number; }
interface ResolvedCandidate extends SnapCandidate { originalDistance: number; penaltyApplied: number; finalScore: number; }
```

---

## 7. Corridor, Prediction & Bearing

- `calculateDynamicCorridor(speedMps, accuracy, upcomingTurn)`: Computes speed/accuracy-adaptive lateral corridor width.
- `DeviationDetector`: Compound deviation signal evaluator.
- `advancePredictor(linearOffset, speed, dt, beta)`: Progress advance prediction.
- `applyGpsCorrection(predictedOffset, measuredOffset, beta)`: Blends predicted and measured progress.
- `validateProgressUpdate(currentIdx, newIdx, maxProgressIdx, isCircuit, routeLength)`: Monotonic progress validation.
- `applyBearingSmoothing(currentBearing, gpsBearing, routeBearing, speed, alpha)`: Blends and smooths vehicle heading.
- `blendBearing(b1, b2, weight)`: Angular weighted blend.
- `calculateRobustBearing(coords, index, lookahead)`: Windowed polyline heading calculation.
- `getSpeedAdaptiveAlpha(speedMps)`: Calculates velocity-adaptive smoothing weights.

---

## 8. State Machines (`OffRouteFSM`, `NavigationFSM`)

### `OffRouteFSM`
Tracks deviation, rerouting, and route rejoin progress:
- States (`OffRouteState`): `'ON_ROUTE' | 'DEVIATING' | 'OFF_ROUTE' | 'REROUTING' | 'REJOINING' | 'REJOINED' | 'FAILED'`.
- Events (`OffRouteEvent`): `DEVIATION_SUSPECTED`, `DEVIATION_CONFIRMED`, `REROUTE_STARTED`, `REROUTE_SUCCESS`, `REROUTE_FAILED`, `REJOIN_DETECTED`, `REJOIN_CONFIRMED`, `RESUME`, `RESET`.
- Context (`OffRouteContext`): Contains `deviationSegmentIdx`, `deviationStartMs`, `tempRoute`, `rejoinTarget`, `rejoinDwellFrames`, etc.
- Associated Types: `RejoinTarget`, `TempRoute`.

### `NavigationFSM`
Manages high-level journey lifecycle:
- States (`NavLifecycleState`): `'IDLE' | 'OVERVIEW' | 'APPROACHING_ROUTE' | 'ON_ROUTE'`.
- Events (`LifecycleEvent`): `ROUTE_LOADED`, `USER_START_NAVIGATION`, `ROUTE_JOINED`, `NAVIGATION_FINISHED`, `CANCEL_NAVIGATION`, `RESET`.
- Context (`LifecycleContext`): Contains `resumeIndex`.

---

## 9. Dead Reckoning Engine

```typescript
class DeadReckoningEngine {
  constructor(maxAgeMs?: number);
  updateAnchor(offsetM: number, timestampMs: number, speedMps: number): void;
  predict(nowMs: number, route: Coordinate[], cumulative: Float64Array): DRPrediction | null;
  reset(): void;
}
function computeDeadReckoningOnRoute(anchorOffsetM: number, anchorTimeMs: number, speedMps: number, nowMs: number, route: Coordinate[], cumulative: Float64Array, maxAgeMs?: number): DRPrediction | null;
```

---

## 10. Value-Add Modules

### `VoiceTriggerEngine`
```typescript
class VoiceTriggerEngine {
  constructor(options?: VoiceTriggerOptions);
  setInstructions(instructions: NavInstruction[]): void;
  update(state: NavCoreState): VoiceCue | null;
  onInstruction(instr: NavInstruction, state: NavCoreState): VoiceCue;
  reset(): void;
}
interface VoiceTriggerOptions { earlyTriggerMeters?: number; lateTriggerMeters?: number; reannounceMeters?: number; }
interface VoiceCue { instruction: NavInstruction; text: string; distanceMetres: number; priority: VoicePriority; triggerId: string; }
type VoicePriority = 'low' | 'normal' | 'high' | 'urgent';
```

### `ETAEngine`
```typescript
class ETAEngine {
  constructor(options?: ETAOptions);
  update(state: NavCoreState): ETAResult;
  reset(): void;
}
interface ETAOptions { speedWindowSize?: number; minimumSpeedMs?: number; fallbackSpeedMs?: number; }
interface ETAResult { etaSeconds: number; etaMs: number; distanceRemainingM: number; averageSpeedMs: number; isReliable: boolean; }
```

### `GeofencingEngine`
```typescript
class GeofencingEngine {
  constructor(options?: GeofencingOptions);
  addCircle(id: string, name: string, center: Coordinate, radiusM: number, meta?: unknown): string;
  addPolygon(id: string, name: string, coords: Coordinate[], meta?: unknown): string;
  remove(id: string): void;
  clear(): void;
  listIds(): string[];
  update(coord: Coordinate): GeofenceEvent[];
  isInside(id: string, coord: Coordinate): boolean;
}
interface GeofencingOptions { dwellThresholdMs?: number; onEvent?: (event: GeofenceEvent) => void; zones?: ZoneDefinition[]; }
interface GeofenceEvent { id: string; name: string; type: GeofenceEventType; coord: Coordinate; dwellMs?: number; meta?: unknown; }
type GeofenceEventType = 'enter' | 'exit' | 'dwell';
type GeofenceType = 'circle' | 'polygon';
interface ZoneDefinition { id: string; name: string; type: GeofenceType; center?: Coordinate; radiusM?: number; coordinates?: Coordinate[]; meta?: unknown; }
```

### `InstructionEditor`
```typescript
class InstructionEditor {
  addDepart(coord: Coordinate, text?: string): this;
  addTurn(coord: Coordinate, text: string, geometryIndex: number): this;
  addExamPoint(coord: Coordinate, text: string, geometryIndex: number, options?: { severity?: 'info' | 'warning' | 'critical'; zone?: string }): this;
  addCheckpoint(coord: Coordinate, geometryIndex: number, meta?: unknown): this;
  addArrive(coord: Coordinate, text?: string): this;
  update(id: string, patch: Partial<RichInstruction>): void;
  remove(id: string): void;
  reorder(id: string, newIndex: number): void;
  sort(): this;
  attachToCumulative(route: Coordinate[]): this;
  toArray(): NavInstruction[];
  toRichArray(): RichInstruction[];
  clear(): void;
}
type InstructionType = 'turn' | 'exam_point' | 'checkpoint' | 'depart' | 'arrive' | 'custom';
interface RichInstruction extends NavInstruction { id: string; type: InstructionType; severity?: string; meta?: unknown; }
function resolveNextInstruction(instructions: NavInstruction[], currentIndex: number, route: Coordinate[], speedMps: number): NavInstruction | null;
```

### `CustomRouteBuilder`
```typescript
class CustomRouteBuilder {
  addWaypoint(coord: Coordinate, options?: WaypointOptions): string;
  insertWaypoint(coord: Coordinate, afterId: string, options?: WaypointOptions): string;
  removeWaypoint(id: string): void;
  moveWaypoint(id: string, newCoord: Coordinate): void;
  getWaypoints(): ReadonlyArray<CustomWaypoint>;
  chunk(strategy: 'OVERLAP_1', maxChunkSize: number): Coordinate[][];
  buildStraightLine(): { geometry: Coordinate[]; waypoints: CustomWaypoint[] };
  fromGPX(gpxString: string): this;
  toGPX(): string;
  fromGeoJSON(geojson: unknown): this;
  toGeoJSON(): unknown;
  clear(): void;
}
interface CustomWaypoint { id: string; coord: Coordinate; name?: string; silent?: boolean; }
interface WaypointOptions { name?: string; silent?: boolean; }
interface BuildOptions { profile?: string; }
```

---

## 11. Licensing & Constants

- `LicenseManager`: Asymmetric ECDSA P-256 license verifier.
- `LicensePayload`: `{ exp: number; bid: string; f?: string[]; t?: 'core' | 'pro' }`.
- `LicenseStatus`: `'VALID' | 'INVALID' | 'EXPIRED' | 'MISSING'`.
- `FEATURES`: Feature constants (`GPS_SMOOTHING`, `BASIC_SNAPPING`, `ADVANCED_SNAPPING`, `DEAD_RECKONING`, `ROUTE_OFFSET`, `PROGRESS_TRACKING`, `ADVANCED_BEARING`, `COMPOUND_DEVIATION`, `PARALLEL_ROAD_RESOLUTION`, `U_TURN_PROTECTION`, `VOICE_TRIGGERS`, `ETA`, `GEOFENCING`, `NAV_AI`).
- `FeatureKey`: Type of values in `FEATURES`.
- `Constants`: Central tuning constants.
- `MapRendererAdapter`: Interface for map view renderers.
- `RouteStyle`, `VehicleStyle`, `CameraOptions`: Styling options for map renderers.