# Architecture

## The 11-Stage Navigation Pipeline

Every call to `engine.update(gps)` runs this pipeline in order:

```
GPS Input
   â”‚
   â–¼
1. Kalman Filter (noise smoothing)
   â”‚  KalmanFilter2D â€” smooths noisy GPS coordinates using Q/R noise matrices
   â–¼
2. Route Snapper (map matching)
   â”‚  RouteSnapper â€” projects filtered coord onto nearest route segment
   â”‚  â†³ Bearing penalty â†’ U-turn protection (FEATURE: U_TURN_PROTECTION)
   â”‚  â†³ Inertia penalty â†’ anti-oscillation between segments
   â–¼
3. Dynamic Corridor (tolerance zone)
   â”‚  calculateDynamicCorridor â€” widens corridor at high speed / low accuracy
   â–¼
4. Progress Validation (monotonic advance)
   â”‚  validateProgressUpdate â€” rejects backwards jumps > MAX_SNAP_DISTANCE
   â–¼
5. Linear Offset Update (dead reckoning prep)
   â”‚  applyGpsCorrection â€” blends measured route offset with predicted offset
   â–¼
6. Bearing Smoothing (if ADVANCED_BEARING licensed)
   â”‚  applyBearingSmoothing â€” blends GPS bearing + route-derived bearing
   â–¼
7. Deviation Detection (off-route FSM)
   â”‚  DeviationDetector â†’ OffRouteFSM transitions:
   â”‚  ON_ROUTE â†’ DEVIATING â†’ OFF_ROUTE â†’ REJOINING
   â–¼
8. Lifecycle Join Detection
   â”‚  NavigationFSM: APPROACHING_ROUTE â†’ NAVIGATING
   â–¼
9. Instruction Resolution (speed-adaptive trigger)
   â”‚  resolveNextInstruction â€” fires when within trigger window of next maneuver
   â–¼
10. Arrival Detection
    â”‚  haversineDistance to destination < arrivalThresholdMeters
    â–¼
11. Dead Reckoning anchor update (if DEAD_RECKONING licensed)
    â”‚  DeadReckoningEngine â€” predicts position between GPS updates
    â–¼
NavCoreState (snapshot of all state)
```

---

## Module Map

```
@ingissa/navcore-core/src/
â”œâ”€â”€ NavCore.ts               â† Main orchestrator (the 11 stages above)
â”œâ”€â”€ features.ts              â† Feature flag constants
â”œâ”€â”€ constants.ts             â† Tunable thresholds
â”‚
â”œâ”€â”€ geo/
â”‚   â”œâ”€â”€ haversine.ts         â† Distance, bearing, destination point
â”‚   â”œâ”€â”€ bearing.ts           â† Angle normalization, interpolation
â”‚   â”œâ”€â”€ projection.ts        â† Point-on-segment projection
â”‚   â””â”€â”€ cumulative.ts        â† Cumulative distance arrays (forward + reverse)
â”‚
â”œâ”€â”€ kalman/
â”‚   â””â”€â”€ KalmanFilter2D.ts    â† 2D Kalman filter for GPS smoothing
â”‚
â”œâ”€â”€ snapper/
â”‚   â”œâ”€â”€ RouteSnapper.ts      â† Stage 2 â€” map matching with penalties
â”‚   â””â”€â”€ ParallelRoadResolver.ts â† Standalone parallel road / U-turn API [P0]
â”‚
â”œâ”€â”€ corridor/
â”‚   â”œâ”€â”€ DynamicCorridor.ts   â† Stage 3 â€” speed/accuracy-adaptive width
â”‚   â””â”€â”€ DeviationDetector.ts â† Stage 7 â€” compound deviation signals
â”‚
â”œâ”€â”€ bearing/
â”‚   â””â”€â”€ BearingEngine.ts     â† Stage 6 â€” smoothing, blending, speed-adaptive Î±
â”‚
â”œâ”€â”€ progress/
â”‚   â”œâ”€â”€ ProgressTracker.ts   â† Stage 4 â€” monotonic index validation
â”‚   â”œâ”€â”€ InstructionResolver.ts â† Stage 9 â€” proximity + bearing gate trigger
â”‚   â””â”€â”€ InstructionEditor.ts â† Fluent instruction builder [P0]
â”‚
â”œâ”€â”€ predictor/
â”‚   â””â”€â”€ RouteOffsetPredictor.ts â† Stage 5 â€” linear offset advance + GPS correction
â”‚
â”œâ”€â”€ dead-reckoning/
â”‚   â””â”€â”€ DeadReckoning.ts     â† Stage 11 â€” dead reckoning between GPS fixes
â”‚
â”œâ”€â”€ off-route/
â”‚   â”œâ”€â”€ NavigationFSM.ts     â† Lifecycle FSM (IDLE â†’ NAVIGATING â†’ FINISHED)
â”‚   â””â”€â”€ OffRouteFSM.ts       â† Off-route FSM (ON_ROUTE â†’ DEVIATING â†’ OFF_ROUTE)
â”‚
â”œâ”€â”€ route-builder/
â”‚   â””â”€â”€ CustomRouteBuilder.ts â† Waypoint management, GPX/GeoJSON import/export
â”‚
â”œâ”€â”€ directions/
â”‚   â”œâ”€â”€ DirectionsProvider.ts    â† Generic interface [P2]
â”‚   â”œâ”€â”€ OSRMDirectionsProvider.ts â† Self-hosted OSRM [P2]
â”‚   â”œâ”€â”€ ValhallaDirectionsProvider.ts â† Self-hosted Valhalla [P2]
â”‚   â””â”€â”€ OpenRouteServiceProvider.ts â† ORS API [P2]
â”‚
â”œâ”€â”€ renderer/
â”‚   â””â”€â”€ MapRendererAdapter.ts â† Generic renderer interface [P1]
â”‚
â”œâ”€â”€ voice/
â”‚   â””â”€â”€ VoiceTriggerEngine.ts â† TTS timing + deduplication [P3]
â”‚
â”œâ”€â”€ eta/
â”‚   â””â”€â”€ ETAEngine.ts          â† Offline ETA computation [P3]
â”‚
â”œâ”€â”€ geofencing/
â”‚   â””â”€â”€ GeofencingEngine.ts   â† Circle + polygon zones [P3]
â”‚
â””â”€â”€ license/
    â””â”€â”€ LicenseManager.ts     â† Feature flag validation

@ingissa/navcore-headless/   â† Renderer: in-memory, CI/testing
@ingissa/navcore-maplibre/   â† Renderer: MapLibre GL JS
@ingissa/navcore-leaflet/    â† Renderer: Leaflet.js
@ingissa/navcore-google-maps/ â† Renderer: Google Maps JS API
@ingissa/navcore-mapbox/     â† Directions: Mapbox Directions API
@ingissa/navcore-simulator/  â† GPS simulation engine for testing
```

---

## State Machine Overview

### Lifecycle FSM (`NavigationFSM`)

```
IDLE â”€â”€ROUTE_LOADEDâ”€â”€â–º ROUTE_LOADED â”€â”€USER_STARTâ”€â”€â–º APPROACHING_ROUTE
                                                          â”‚
                                                   ROUTE_JOINED
                                                          â”‚
                                                          â–¼
                                                    NAVIGATING â”€â”€NAVIGATION_FINISHEDâ”€â”€â–º FINISHED
                                                          â”‚
                                                   GPS_LOST / RECOVERED
```

### Off-Route FSM (`OffRouteFSM`)

```
ON_ROUTE â”€â”€DEVIATION_SUSPECTEDâ”€â”€â–º DEVIATING â”€â”€DEVIATION_CONFIRMEDâ”€â”€â–º OFF_ROUTE
    â–²                                  â”‚                                  â”‚
    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€RESUMEâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜             REROUTE_STARTED      â”‚
                                                          â”‚               â”‚
                                                          â–¼               â”‚
                                                    REJOINING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Key Constants

Located in `core/src/constants.ts`. Override via `NavCoreOptions`:

| Constant | Default | Description |
|---|---|---|
| `BASE_CORRIDOR_METERS` | 25m | Off-route detection radius at slow speed |
| `MAX_CORRIDOR_METERS` | 80m | Max corridor at high speed / low accuracy |
| `ARRIVAL_THRESHOLD_METERS` | 15m | Distance to destination that triggers arrival |
| `BEARING_MISMATCH_THRESHOLD` | 60Â° | Bearing delta that triggers U-turn penalty |
| `BEARING_MISMATCH_PENALTY` | 80m | Score penalty added for U-turn mismatch |
| `MAX_SNAP_DISTANCE` | 150m | Hard cutoff for snapping |
| `SNAP_WINDOW_SIZE` | 20 | Number of route segments to search ahead |
| `GPS_STALE_MS` | 5000ms | GPS age above which `isGpsStale` is true |
| `BETA_CORRECTION` | 0.3 | Blend factor for GPS correction of linear offset |
