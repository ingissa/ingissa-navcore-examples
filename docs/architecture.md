# Architecture

## The 11-Stage Navigation Pipeline

Every call to `engine.update(gps)` runs this pipeline in order:

```
GPS Input
   │
   ▼
1. Kalman Filter (noise smoothing)
   │  KalmanFilter2D — smooths noisy GPS coordinates using Q/R noise matrices
   ▼
2. Route Snapper (map matching)
   │  RouteSnapper — projects filtered coord onto nearest route segment
   │  ↳ Bearing penalty → U-turn protection (FEATURE: U_TURN_PROTECTION)
   │  ↳ Inertia penalty → anti-oscillation between segments
   ▼
3. Dynamic Corridor (tolerance zone)
   │  calculateDynamicCorridor — widens corridor at high speed / low accuracy
   ▼
4. Progress Validation (monotonic advance)
   │  validateProgressUpdate — rejects backwards jumps > MAX_SNAP_DISTANCE
   ▼
5. Linear Offset Update (dead reckoning prep)
   │  applyGpsCorrection — blends measured route offset with predicted offset
   ▼
6. Bearing Smoothing (if ADVANCED_BEARING licensed)
   │  applyBearingSmoothing — blends GPS bearing + route-derived bearing
   ▼
7. Deviation Detection (off-route FSM)
   │  DeviationDetector → OffRouteFSM transitions:
   │  ON_ROUTE → DEVIATING → OFF_ROUTE → REJOINING
   ▼
8. Lifecycle Join Detection
   │  NavigationFSM: APPROACHING_ROUTE → NAVIGATING
   ▼
9. Instruction Resolution (speed-adaptive trigger)
   │  resolveNextInstruction — fires when within trigger window of next maneuver
   ▼
10. Arrival Detection
    │  haversineDistance to destination < arrivalThresholdMeters
    ▼
11. Dead Reckoning anchor update (if DEAD_RECKONING licensed)
    │  DeadReckoningEngine — predicts position between GPS updates
    ▼
NavCoreState (snapshot of all state)
```

---

## Module Map

```
@ingissa/navcore-core/src/
├── NavCore.ts               ← Main orchestrator (the 11 stages above)
├── features.ts              ← Feature flag constants
├── constants.ts             ← Tunable thresholds
│
├── geo/
│   ├── haversine.ts         ← Distance, bearing, destination point
│   ├── bearing.ts           ← Angle normalization, interpolation
│   ├── projection.ts        ← Point-on-segment projection
│   └── cumulative.ts        ← Cumulative distance arrays (forward + reverse)
│
├── kalman/
│   └── KalmanFilter2D.ts    ← 2D Kalman filter for GPS smoothing
│
├── snapper/
│   ├── RouteSnapper.ts      ← Stage 2 — map matching with penalties
│   └── ParallelRoadResolver.ts ← Standalone parallel road / U-turn API [P0]
│
├── corridor/
│   ├── DynamicCorridor.ts   ← Stage 3 — speed/accuracy-adaptive width
│   └── DeviationDetector.ts ← Stage 7 — compound deviation signals
│
├── bearing/
│   └── BearingEngine.ts     ← Stage 6 — smoothing, blending, speed-adaptive α
│
├── progress/
│   ├── ProgressTracker.ts   ← Stage 4 — monotonic index validation
│   ├── InstructionResolver.ts ← Stage 9 — proximity + bearing gate trigger
│   └── InstructionEditor.ts ← Fluent instruction builder [P0]
│
├── predictor/
│   └── RouteOffsetPredictor.ts ← Stage 5 — linear offset advance + GPS correction
│
├── dead-reckoning/
│   └── DeadReckoning.ts     ← Stage 11 — dead reckoning between GPS fixes
│
├── off-route/
│   ├── NavigationFSM.ts     ← Lifecycle FSM (IDLE → NAVIGATING → FINISHED)
│   └── OffRouteFSM.ts       ← Off-route FSM (ON_ROUTE → DEVIATING → OFF_ROUTE)
│
├── route-builder/
│   └── CustomRouteBuilder.ts ← Waypoint management, GPX/GeoJSON import/export
│
├── directions/
│   ├── DirectionsProvider.ts    ← Generic interface [P2]
│   ├── OSRMDirectionsProvider.ts ← Self-hosted OSRM [P2]
│   ├── ValhallaDirectionsProvider.ts ← Self-hosted Valhalla [P2]
│   └── OpenRouteServiceProvider.ts ← ORS API [P2]
│
├── renderer/
│   └── MapRendererAdapter.ts ← Generic renderer interface [P1]
│
├── voice/
│   └── VoiceTriggerEngine.ts ← TTS timing + deduplication [P3]
│
├── eta/
│   └── ETAEngine.ts          ← Offline ETA computation [P3]
│
├── geofencing/
│   └── GeofencingEngine.ts   ← Circle + polygon zones [P3]
│
└── license/
    └── LicenseManager.ts     ← Feature flag validation

@ingissa/navcore-headless/   ← Renderer: in-memory, CI/testing
@ingissa/navcore-maplibre/   ← Renderer: MapLibre GL JS
@ingissa/navcore-leaflet/    ← Renderer: Leaflet.js
@ingissa/navcore-google-maps/ ← Renderer: Google Maps JS API
@ingissa/navcore-mapbox/     ← Directions: Mapbox Directions API
@ingissa/navcore-simulator/  ← GPS simulation engine for testing
```

---

## State Machine Overview

### Lifecycle FSM (`NavigationFSM`)

```
IDLE ──ROUTE_LOADED──► ROUTE_LOADED ──USER_START──► APPROACHING_ROUTE
                                                          │
                                                   ROUTE_JOINED
                                                          │
                                                          ▼
                                                    NAVIGATING ──NAVIGATION_FINISHED──► FINISHED
                                                          │
                                                   GPS_LOST / RECOVERED
```

### Off-Route FSM (`OffRouteFSM`)

```
ON_ROUTE ──DEVIATION_SUSPECTED──► DEVIATING ──DEVIATION_CONFIRMED──► OFF_ROUTE
    ▲                                  │                                  │
    └──────────RESUME──────────────────┘             REROUTE_STARTED      │
                                                          │               │
                                                          ▼               │
                                                    REJOINING ────────────┘
```

---

## Key Constants

Located in `core/src/constants.ts`. Override via `NavCoreOptions`:

| Constant | Default | Description |
|---|---|---|
| `BASE_CORRIDOR_METERS` | 25m | Off-route detection radius at slow speed |
| `MAX_CORRIDOR_METERS` | 80m | Max corridor at high speed / low accuracy |
| `ARRIVAL_THRESHOLD_METERS` | 15m | Distance to destination that triggers arrival |
| `BEARING_MISMATCH_THRESHOLD` | 60° | Bearing delta that triggers U-turn penalty |
| `BEARING_MISMATCH_PENALTY` | 80m | Score penalty added for U-turn mismatch |
| `MAX_SNAP_DISTANCE` | 150m | Hard cutoff for snapping |
| `SNAP_WINDOW_SIZE` | 20 | Number of route segments to search ahead |
| `GPS_STALE_MS` | 5000ms | GPS age above which `isGpsStale` is true |
| `BETA_CORRECTION` | 0.3 | Blend factor for GPS correction of linear offset |
