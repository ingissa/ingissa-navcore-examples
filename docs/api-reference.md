# API Reference

## `NavCore` Ã¢â‚¬â€ Main Engine

### Constructor Options (`NavCoreOptions`)

| Option | Type | Default | Description |
|---|---|---|---|
| `licenseKey` | `string` | `''` | Commercial license key |
| `isDev` | `boolean` | `false` | Dev mode (all features unlocked) |
| `isCircuit` | `boolean` | `false` | Closed-loop route |
| `kalmanQ` | `number` | `0.00001` | Process noise (lower = smoother) |
| `kalmanRBase` | `number` | `0.00005` | Measurement noise base |
| `baseCorridorMeters` | `number` | `25` | Corridor at low speed |
| `maxCorridorMeters` | `number` | `80` | Corridor at high speed/low accuracy |
| `arrivalThresholdMeters` | `number` | `15` | Arrival detection radius |
| `bearingSmoothingAlpha` | `number` | `0.3` | Bearing EMA (0=no smooth, 1=instant) |

### Methods

```typescript
engine.setRoute(route: Coordinate[], instructions?: NavInstruction[]): void
engine.startNavigation(): void
engine.update(gps: NavGpsUpdate): NavCoreState   // main tick Ã¢â‚¬â€ runs all 11 stages
engine.tick(nowMs: number): NavCoreState           // dead-reckoning advance (call at RAF)
engine.getState(): NavCoreState
engine.destroy(): void
engine.on(event, handler): void
engine.off(event, handler): void
```

### Events

| Event | Payload | When |
|---|---|---|
| `routeLoaded` | `{ routeLength }` | `setRoute()` called |
| `navigationStarted` | Ã¢â‚¬â€ | `startNavigation()` called |
| `instruction` | `NavInstruction` | Instruction enters trigger window |
| `arrival` | Ã¢â‚¬â€ | Destination reached |
| `deviation` | `{ anchorIndex, ghostCoord }` | Off-route confirmed |

### `NavGpsUpdate`

```typescript
interface NavGpsUpdate {
  coord: Coordinate;       // [lng, lat]
  accuracy: number | null; // metres (null = unknown)
  bearing: number | null;  // degrees (null = unknown)
  speed: number;           // m/s
  timestamp: number;       // Date.now()
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
  offRouteState: string;
  lifecycleState: string;
  distanceToDestination: number | null;
  distanceToNextInstruction: number | null;
  nextInstructionIndex: number | null;
  currentSpeed: number;
  isGpsStale: boolean;
  gpsAgeMs: number;
}
```

---

## `CustomRouteBuilder`

```typescript
const builder = new CustomRouteBuilder();
builder.addWaypoint([lng, lat], { name?: string, silent?: boolean })  // Ã¢â€ â€™ id
builder.insertWaypoint(coord, afterId)   // Ã¢â€ â€™ id
builder.removeWaypoint(id)
builder.moveWaypoint(id, newCoord)
builder.getWaypoints()                   // Ã¢â€ â€™ ReadonlyArray<CustomWaypoint>
builder.chunk('OVERLAP_1', 25)           // Ã¢â€ â€™ Coordinate[][]
builder.buildStraightLine()              // Ã¢â€ â€™ { geometry, waypoints }
builder.fromGPX(gpxString)
builder.toGPX()                          // Ã¢â€ â€™ string
builder.fromGeoJSON(geojson)
builder.toGeoJSON()                      // Ã¢â€ â€™ FeatureCollection
builder.clear()
builder.size                             // number
```

---

## `InstructionEditor`

```typescript
const editor = new InstructionEditor();
editor.addTurn([lng,lat], 'Turn left', 42)
editor.addExamPoint([lng,lat], 'Check mirrors', 50, { severity: 'warning' })
editor.addCheckpoint([lng,lat], 65)
editor.addDepart([lng,lat])
editor.addArrive([lng,lat])
editor.update(id, patch)
editor.remove(id)
editor.sort()
editor.attachToCumulative(route)   // auto-compute cumulativeOffset + bearings
editor.toArray()                   // Ã¢â€ â€™ NavInstruction[] (use with setRoute)
editor.toRichArray()               // Ã¢â€ â€™ RichInstruction[] (with type/severity/meta)
editor.size                        // number
```

---

## Directions Providers

All implement `DirectionsProvider`:
```typescript
interface DirectionsProvider {
  getRoute(waypoints: Coordinate[], opts?: DirectionsOptions): Promise<DirectionsResult>
}
```

| Provider | Import | Key config |
|---|---|---|
| `MapboxDirectionsProvider` | `@ingissa/navcore-mapbox` | `accessToken` |
| `OSRMDirectionsProvider` | `@ingissa/navcore-core` | `baseUrl` |
| `ValhallaDirectionsProvider` | `@ingissa/navcore-core` | `baseUrl`, `costing` |
| `OpenRouteServiceProvider` | `@ingissa/navcore-core` | `apiKey` |

```typescript
interface DirectionsResult {
  geometry: Coordinate[];
  distance: number;   // metres
  duration: number;   // seconds
  legs: DirectionsLeg[];
  raw?: unknown;
}
```

---

## Renderer Adapters

All implement `MapRendererAdapter`:
```typescript
interface MapRendererAdapter {
  updateVehicle(coord, bearing, state, style?): void
  drawRoute(coords, style?): void
  clearRoute(): void
  panCamera(coord, bearing, options?): void
  destroy(): void
}
```

| Adapter | Package | Peer dep |
|---|---|---|
| `HeadlessAdapter` | `@ingissa/navcore-headless` | none |
| `MapLibreAdapter` | `@ingissa/navcore-maplibre` | maplibre-gl Ã¢â€°Â¥3 |
| `LeafletAdapter` | `@ingissa/navcore-leaflet` | leaflet Ã¢â€°Â¥1.9 |
| `GoogleMapsAdapter` | `@ingissa/navcore-google-maps` | @types/google.maps |

---

## `VoiceTriggerEngine`

```typescript
const voice = new VoiceTriggerEngine({ earlyTriggerMeters: 120 });
voice.setInstructions(instructions)
const cue = voice.update(state)     // Ã¢â€ â€™ VoiceCue | null
voice.onInstruction(instr, state)   // Ã¢â€ â€™ VoiceCue (direct)
voice.reset()

interface VoiceCue {
  text: string;
  distanceMetres: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  triggerId: string;
}
```

---

## `ETAEngine`

```typescript
const eta = new ETAEngine({ speedWindowSize: 6 });
const result = eta.update(state);

interface ETAResult {
  etaSeconds: number;
  etaMs: number;
  distanceRemainingM: number;
  averageSpeedMs: number;
  isReliable: boolean;
}
```

---

## `GeofencingEngine`

### Constructor

```typescript
const geo = new GeofencingEngine(options?: GeofencingOptions);

interface GeofencingOptions {
  dwellThresholdMs?: number;    // default: 10 000 ms
  onEvent?: (event: GeofenceEvent) => void;  // global callback
  zones?: ZoneDefinition[];     // register zones at creation time
}
```

### Methods

```typescript
// Registration Ã¢â‚¬â€ name is the human-readable label shown in events
geo.addCircle(id: string, name: string, center: Coordinate, radiusM: number, meta?: unknown): string
geo.addPolygon(id: string, name: string, coords: Coordinate[], meta?: unknown): string
geo.remove(id: string): void
geo.clear(): void
geo.listIds(): string[]

// Runtime
const events = geo.update(coord: Coordinate)       // Ã¢â€ â€™ GeofenceEvent[]
geo.isInside(id: string, coord: Coordinate)        // Ã¢â€ â€™ boolean
```

### `GeofenceEvent`

```typescript
interface GeofenceEvent {
  id: string;              // matches the id passed to addCircle / addPolygon
  name: string;            // human-readable label (e.g. 'School Zone')
  type: 'enter' | 'exit' | 'dwell';
  coord: Coordinate;       // coordinate that triggered the event
  dwellMs?: number;        // populated for 'exit' and 'dwell' events
  meta?: unknown;          // custom metadata passed at registration
}
```

### Example

```typescript
const geo = new GeofencingEngine({ dwellThresholdMs: 5000 });

geo.addCircle('school-zone', 'School Zone', [2.347, 48.859], 50, { speedLimit: 30 });
geo.addPolygon('exam-area', 'Exam District', [
  [2.34, 48.85], [2.36, 48.85], [2.36, 48.87], [2.34, 48.87],
]);

engine.on('update', ({ snappedCoord }) => {
  const events = geo.update(snappedCoord);
  for (const evt of events) {
    console.log(`${evt.type}: ${evt.name} (${evt.id})`);
    if (evt.type === 'dwell') console.log(`  inside for ${evt.dwellMs}ms`);
  }
});
```

---

## `ParallelRoadResolver`

```typescript
const resolver = new ParallelRoadResolver({ bearingPenalty: 80 });
const best = resolver.resolveBest(candidates, vehicleBearing, prevSegmentIdx);
const all = resolver.resolve(candidates, vehicleBearing, prevSegmentIdx);
const uturn = resolver.isLikelyUTurn(bearing, segA, segB);
```

---

## `HeadlessAdapter` Ã¢â‚¬â€ Test Assertions

```typescript
const adapter = new HeadlessAdapter();
adapter.assertReached([lng, lat], 30)   // throws if not reached within 30m
adapter.assertArrived()                  // throws if hasArrived never true
adapter.assertNeverOffRoute()            // throws if ever off-route
adapter.getHistory()                     // Ã¢â€ â€™ PositionRecord[]
adapter.reset()
```
