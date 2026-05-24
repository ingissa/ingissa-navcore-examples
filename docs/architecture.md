# Architecture

## The 11-Stage Navigation Pipeline

Every call to `engine.update(gps)` runs this pipeline in order:

```
GPS Input
   Ã¢â€â€š
   Ã¢â€“Â¼
1. Kalman Filter (noise smoothing)
   Ã¢â€â€š  KalmanFilter2D Ã¢â‚¬â€ smooths noisy GPS coordinates using Q/R noise matrices
   Ã¢â€“Â¼
2. Route Snapper (map matching)
   Ã¢â€â€š  RouteSnapper Ã¢â‚¬â€ projects filtered coord onto nearest route segment
   Ã¢â€â€š  Ã¢â€ Â³ Bearing penalty Ã¢â€ â€™ U-turn protection (FEATURE: U_TURN_PROTECTION)
   Ã¢â€â€š  Ã¢â€ Â³ Inertia penalty Ã¢â€ â€™ anti-oscillation between segments
   Ã¢â€“Â¼
3. Dynamic Corridor (tolerance zone)
   Ã¢â€â€š  calculateDynamicCorridor Ã¢â‚¬â€ widens corridor at high speed / low accuracy
   Ã¢â€“Â¼
4. Progress Validation (monotonic advance)
   Ã¢â€â€š  validateProgressUpdate Ã¢â‚¬â€ rejects backwards jumps > MAX_SNAP_DISTANCE
   Ã¢â€“Â¼
5. Linear Offset Update (dead reckoning prep)
   Ã¢â€â€š  applyGpsCorrection Ã¢â‚¬â€ blends measured route offset with predicted offset
   Ã¢â€“Â¼
6. Bearing Smoothing (if ADVANCED_BEARING licensed)
   Ã¢â€â€š  applyBearingSmoothing Ã¢â‚¬â€ blends GPS bearing + route-derived bearing
   Ã¢â€“Â¼
7. Deviation Detection (off-route FSM)
   Ã¢â€â€š  DeviationDetector Ã¢â€ â€™ OffRouteFSM transitions:
   Ã¢â€â€š  ON_ROUTE Ã¢â€ â€™ DEVIATING Ã¢â€ â€™ OFF_ROUTE Ã¢â€ â€™ REJOINING
   Ã¢â€“Â¼
8. Lifecycle Join Detection
   Ã¢â€â€š  NavigationFSM: APPROACHING_ROUTE Ã¢â€ â€™ NAVIGATING
   Ã¢â€“Â¼
9. Instruction Resolution (speed-adaptive trigger)
   Ã¢â€â€š  resolveNextInstruction Ã¢â‚¬â€ fires when within trigger window of next maneuver
   Ã¢â€“Â¼
10. Arrival Detection
    Ã¢â€â€š  haversineDistance to destination < arrivalThresholdMeters
    Ã¢â€“Â¼
11. Dead Reckoning anchor update (if DEAD_RECKONING licensed)
    Ã¢â€â€š  DeadReckoningEngine Ã¢â‚¬â€ predicts position between GPS updates
    Ã¢â€“Â¼
NavCoreState (snapshot of all state)
```

---

## Module Map

```
@ingissa/navcore-core/src/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ NavCore.ts               Ã¢â€ Â Main orchestrator (the 11 stages above)
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ features.ts              Ã¢â€ Â Feature flag constants
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ constants.ts             Ã¢â€ Â Tunable thresholds
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ geo/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ haversine.ts         Ã¢â€ Â Distance, bearing, destination point
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ bearing.ts           Ã¢â€ Â Angle normalization, interpolation
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ projection.ts        Ã¢â€ Â Point-on-segment projection
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ cumulative.ts        Ã¢â€ Â Cumulative distance arrays (forward + reverse)
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ kalman/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ KalmanFilter2D.ts    Ã¢â€ Â 2D Kalman filter for GPS smoothing
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ snapper/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ RouteSnapper.ts      Ã¢â€ Â Stage 2 Ã¢â‚¬â€ map matching with penalties
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ ParallelRoadResolver.ts Ã¢â€ Â Standalone parallel road / U-turn API [P0]
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ corridor/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ DynamicCorridor.ts   Ã¢â€ Â Stage 3 Ã¢â‚¬â€ speed/accuracy-adaptive width
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ DeviationDetector.ts Ã¢â€ Â Stage 7 Ã¢â‚¬â€ compound deviation signals
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ bearing/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ BearingEngine.ts     Ã¢â€ Â Stage 6 Ã¢â‚¬â€ smoothing, blending, speed-adaptive ÃŽÂ±
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ progress/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ProgressTracker.ts   Ã¢â€ Â Stage 4 Ã¢â‚¬â€ monotonic index validation
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ InstructionResolver.ts Ã¢â€ Â Stage 9 Ã¢â‚¬â€ proximity + bearing gate trigger
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ InstructionEditor.ts Ã¢â€ Â Fluent instruction builder [P0]
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ predictor/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ RouteOffsetPredictor.ts Ã¢â€ Â Stage 5 Ã¢â‚¬â€ linear offset advance + GPS correction
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ dead-reckoning/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ DeadReckoning.ts     Ã¢â€ Â Stage 11 Ã¢â‚¬â€ dead reckoning between GPS fixes
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ off-route/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ NavigationFSM.ts     Ã¢â€ Â Lifecycle FSM (IDLE Ã¢â€ â€™ NAVIGATING Ã¢â€ â€™ FINISHED)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ OffRouteFSM.ts       Ã¢â€ Â Off-route FSM (ON_ROUTE Ã¢â€ â€™ DEVIATING Ã¢â€ â€™ OFF_ROUTE)
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ route-builder/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ CustomRouteBuilder.ts Ã¢â€ Â Waypoint management, GPX/GeoJSON import/export
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ directions/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ DirectionsProvider.ts    Ã¢â€ Â Generic interface [P2]
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ OSRMDirectionsProvider.ts Ã¢â€ Â Self-hosted OSRM [P2]
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ValhallaDirectionsProvider.ts Ã¢â€ Â Self-hosted Valhalla [P2]
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ OpenRouteServiceProvider.ts Ã¢â€ Â ORS API [P2]
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ renderer/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ MapRendererAdapter.ts Ã¢â€ Â Generic renderer interface [P1]
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ voice/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ VoiceTriggerEngine.ts Ã¢â€ Â TTS timing + deduplication [P3]
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ eta/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ ETAEngine.ts          Ã¢â€ Â Offline ETA computation [P3]
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ geofencing/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ GeofencingEngine.ts   Ã¢â€ Â Circle + polygon zones [P3]
Ã¢â€â€š
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ license/
    Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ LicenseManager.ts     Ã¢â€ Â Feature flag validation

@ingissa/navcore-headless/   Ã¢â€ Â Renderer: in-memory, CI/testing
@ingissa/navcore-maplibre/   Ã¢â€ Â Renderer: MapLibre GL JS
@ingissa/navcore-leaflet/    Ã¢â€ Â Renderer: Leaflet.js
@ingissa/navcore-google-maps/ Ã¢â€ Â Renderer: Google Maps JS API
@ingissa/navcore-mapbox/     Ã¢â€ Â Directions: Mapbox Directions API
@ingissa/navcore-simulator/  Ã¢â€ Â GPS simulation engine for testing
```

---

## State Machine Overview

### Lifecycle FSM (`NavigationFSM`)

```
IDLE Ã¢â€â‚¬Ã¢â€â‚¬ROUTE_LOADEDÃ¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Âº ROUTE_LOADED Ã¢â€â‚¬Ã¢â€â‚¬USER_STARTÃ¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Âº APPROACHING_ROUTE
                                                          Ã¢â€â€š
                                                   ROUTE_JOINED
                                                          Ã¢â€â€š
                                                          Ã¢â€“Â¼
                                                    NAVIGATING Ã¢â€â‚¬Ã¢â€â‚¬NAVIGATION_FINISHEDÃ¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Âº FINISHED
                                                          Ã¢â€â€š
                                                   GPS_LOST / RECOVERED
```

### Off-Route FSM (`OffRouteFSM`)

```
ON_ROUTE Ã¢â€â‚¬Ã¢â€â‚¬DEVIATION_SUSPECTEDÃ¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Âº DEVIATING Ã¢â€â‚¬Ã¢â€â‚¬DEVIATION_CONFIRMEDÃ¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Âº OFF_ROUTE
    Ã¢â€“Â²                                  Ã¢â€â€š                                  Ã¢â€â€š
    Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬RESUMEÃ¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ             REROUTE_STARTED      Ã¢â€â€š
                                                          Ã¢â€â€š               Ã¢â€â€š
                                                          Ã¢â€“Â¼               Ã¢â€â€š
                                                    REJOINING Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
```

---

## Key Constants

Located in `core/src/constants.ts`. Override via `NavCoreOptions`:

| Constant | Default | Description |
|---|---|---|
| `BASE_CORRIDOR_METERS` | 25m | Off-route detection radius at slow speed |
| `MAX_CORRIDOR_METERS` | 80m | Max corridor at high speed / low accuracy |
| `ARRIVAL_THRESHOLD_METERS` | 15m | Distance to destination that triggers arrival |
| `BEARING_MISMATCH_THRESHOLD` | 60Ã‚Â° | Bearing delta that triggers U-turn penalty |
| `BEARING_MISMATCH_PENALTY` | 80m | Score penalty added for U-turn mismatch |
| `MAX_SNAP_DISTANCE` | 150m | Hard cutoff for snapping |
| `SNAP_WINDOW_SIZE` | 20 | Number of route segments to search ahead |
| `GPS_STALE_MS` | 5000ms | GPS age above which `isGpsStale` is true |
| `BETA_CORRECTION` | 0.3 | Blend factor for GPS correction of linear offset |
