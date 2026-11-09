# Architecture Overview

This document provides a architectural reference for the NavCore SDK pipeline, module structure, and tuning constants. For visual flowcharts and state diagrams, see [Architecture & Pipeline Concepts](./concepts.md).

---

## 11-Stage Pipeline Summary

On every GPS fix fed to `engine.update(gps)`, NavCore executes 11 deterministic processing stages:

1. **Kalman Filtering (`KalmanFilter2D`)**: Coordinate noise reduction operating directly in angular degrees.
2. **Route Snapping (`RouteSnapper`)**: Nearest projection with bearing penalties (U-turn anti-snap) and inertia penalties (anti-oscillation).
3. **Dynamic Corridor (`calculateDynamicCorridor`)**: Dynamic corridor sizing based on speed, accuracy, and turn anticipation.
4. **Progress Validation (`validateProgressUpdate`)**: Monotonic forward progress validation along route indices.
5. **Linear Offset Prediction (`applyGpsCorrection`)**: Interpolates sub-segment distance along route geometry with beta correction.
6. **Bearing Engine (`applyBearingSmoothing`)**: Exponential moving average heading smoothing with lookahead.
7. **Deviation Detection (`DeviationDetector` & `OffRouteFSM`)**: Compound deviation checks (lateral distance, heading divergence, and movement away).
8. **Lifecycle Synchronization (`NavigationFSM`)**: Manages navigation lifecycle states (`IDLE`, `OVERVIEW`, `APPROACHING_ROUTE`, `ON_ROUTE`).
9. **Instruction Resolution (`resolveNextInstruction`)**: Proximity and bearing gate triggering for upcoming maneuvers.
10. **Arrival Detection**: Haversine distance threshold evaluation at route destination.
11. **Dead Reckoning (`DeadReckoningEngine`)**: Positional extrapolation during temporary signal dropouts.

---

## Verified Engine Constants

All constants are centralized in [`packages/core/src/constants.ts`](file:///E:/WORKSPACE/expo_projects/navcore-sdk/packages/core/src/constants.ts):

| Parameter | Symbol | Default Value | Description |
|---|---|---|---|
| Base Corridor | `BASE_CORRIDOR_METERS` | `25` m | Minimum corridor width at low speed |
| Maximum Corridor | `MAX_CORRIDOR_METERS` | `60` m | Maximum allowable corridor width |
| Speed Corridor Factor | `SPEED_CORRIDOR_FACTOR` | `1.2` | Multiplier applied to vehicle speed in m/s |
| GPS Accuracy Factor | `GPS_ACCURACY_FACTOR` | `0.5` | Multiplier applied to reported horizontal accuracy |
| Turn Corridor Multiplier| `TURN_CORRIDOR_MULTIPLIER` | `1.4` | Expansion multiplier applied near upcoming turns |
| Turn Lookahead Distance | `TURN_LOOKAHEAD_DISTANCE_METERS` | `40` m | Proximity window triggering turn corridor expansion |
| Maximum Snap Distance | `MAX_SNAP_DISTANCE` | `80` m | Distance threshold past which fixes are skipped |
| Snap Search Window | `SNAP_WINDOW_SIZE` | `25` segments | Forward search segment window |
| Bearing Mismatch Angle | `BEARING_MISMATCH_THRESHOLD` | `90°` | Delta angle threshold triggering U-turn penalty |
| Bearing Mismatch Penalty | `BEARING_MISMATCH_PENALTY` | `500` score | Score penalty added for reverse-direction segments |
| Inertia Penalty | `INERTIA_PENALTY` | `200` score | Score penalty added for distant forward segments |
| Inertia Segment Distance| `INERTIA_SEGMENT_DIST` | `5` segments | Segment delta threshold triggering inertia penalty |
| Bearing Smoothing Alpha | `BEARING_SMOOTHING_ALPHA` | `0.3` | Exponential moving average smoothing weight |
| Bearing Minimum Speed | `BEARING_MIN_SPEED_MPS` | `1.5` m/s | Minimum speed required to trust GPS bearing |
| Bearing Alignment Gate | `BEARING_ALIGNMENT_THRESHOLD` | `55°` | Heading alignment threshold |
| Arrival Radius | `ARRIVAL_THRESHOLD_METERS` | `30` m | Destination proximity triggering arrival |
| Dead Reckoning Max Age | `DR_MAX_AGE_MS` | `5000` ms | Maximum extrapolation duration without GPS |
| Deviation Confirmation | `OFF_ROUTE_CONFIRM_MS` | `2000` ms | Dwell duration in `DEVIATING` before `OFF_ROUTE` |
| Rejoin Confirmation | `REJOIN_CONFIRM_MS` | `1500` ms | Time required to confirm route re-entry |
| Rejoin Cooldown | `REJOIN_COOLDOWN_MS` | `12000` ms | Suppression cooldown between successive rejoins |
| GPS Stale Threshold | `GPS_STALE_MS` | `3000` ms | Age above which GPS fix is marked stale |
| Linear Beta Correction | `BETA_CORRECTION` | `0.15` | GPS blending ratio for route offset |

---

## State Machines

### 1. `NavigationFSM` (Lifecycle)
Valid states defined in `packages/core/src/off-route/NavigationFSM.ts`:
- `IDLE`: Initial state or post-arrival reset.
- `OVERVIEW`: Route loaded and ready.
- `APPROACHING_ROUTE`: Navigation started; vehicle moving toward route start.
- `ON_ROUTE`: Vehicle has joined the route geometry and active guidance is running.

### 2. `OffRouteFSM` (Deviation & Recovery)
Valid states defined in `packages/core/src/off-route/OffRouteFSM.ts`:
- `ON_ROUTE`: Traversing the route within corridor bounds.
- `DEVIATING`: Departure suspected; confirmation timer running.
- `OFF_ROUTE`: Departure confirmed after 2000ms.
- `REROUTING`: Alternate path request in progress.
- `REJOINING`: Following temporary route back to main line.
- `REJOINED`: Re-entered valid corridor (dwell threshold met).
- `FAILED`: Reroute computation failure.