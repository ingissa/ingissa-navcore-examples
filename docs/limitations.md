# Known Limitations & Technical Constraints

This document explicitly enumerates the architectural boundaries, algorithmic trade-offs, and operational limitations of the NavCore SDK (1.0.9).

---

## 1. Core vs. Pro Feature Gating

In `@ingissa/navcore-core`:
- **Core Tier Capabilities**: Kalman filter GPS smoothing, basic segment snapping (nearest projection), cumulative route distances, route builder (`CustomRouteBuilder`), and directions adapters (OSRM, Valhalla, OpenRouteService).
- **Pro Tier Capabilities**: Advanced bearing smoothing with lookahead, compound deviation detection, dead reckoning, off-route and lifecycle state machines (`NavigationFSM`, `OffRouteFSM`), voice triggers (`VoiceTriggerEngine`), ETA calculation (`ETAEngine`), and geofencing (`GeofencingEngine`).
- **Core Deviation Limitation**: In the un-licensed Core fallback path, lateral departures past the corridor emit a `deviation` event with `DEVIATION_SUSPECTED`, but **never transition `OffRouteFSM` into `OFF_ROUTE`**. Automatic reroute triggers require the Pro compound deviation feature.

---

## 2. Off-Route Detection: Slow Gradual Drift

The `DeviationDetector` uses a compound confirmation gate to prevent false off-route triggers in tunnels, motorway flyovers, or urban GPS bounces:

$$\text{confirmed} = \text{outsideCorridor} \land (\text{bearingMismatch} \lor \text{movingAway})$$

Where:
- $\text{bearingMismatch}$ requires angle difference $> 90^\circ$.
- $\text{movingAway}$ requires ground speed $> 1.5\text{ m/s}$ and distance to the next segment increasing by $> 5\text{ metres}$ within a single GPS update tick.

### Consequence:
If a vehicle slowly and gradually drifts away from the route polyline while continuing to travel roughly parallel to the road ($\Delta\text{heading} \le 90^\circ$ and per-tick distance delta $\le 5\text{m}$), **`confirmed` will remain false**. The engine will remain in the `DEVIATING` state and will not confirm `OFF_ROUTE` until either heading diverges or a sharp turn produces an abrupt distance leap.

---

## 3. Voice Instruction Triggers Do Not Produce Audio

- **No Embedded TTS**: `VoiceTriggerEngine` is an event-scheduling calculator, not an audio synthesis library. It computes *when* a maneuver enters the announcement window and returns structured `VoiceCue` objects.
- **Application Responsibility**: The host application must wire the resulting `cue.text` to the platform speech engine (e.g., `window.speechSynthesis` in browsers, or `expo-speech` in React Native).
- **Fixed Distance Windows**: Unlike some proprietary systems, NavCore's default trigger distances are fixed constants (`earlyTriggerMeters: 120m`, `lateTriggerMeters: 20m`, `reannounceMeters: 300m`). They do not dynamically expand or contract based on vehicle velocity.

---

## 4. Kalman Filtering Operates in Angular Degrees

`KalmanFilter2D` reduces noise by performing two-dimensional state estimation directly on raw geographic coordinates:
- State vector: $\mathbf{x} = [\text{lng}, \text{lat}, v_{\text{lng}}, v_{\text{lat}}]^T$ in degrees and deg/s.
- Because longitudinal degrees vary in metric width depending on latitude ($\approx 111.32 \times \cos(\text{lat})\text{ km}$), measurement covariance scaling ($\text{rBase} = 0.00005$) exhibits minor anisotropy across extreme northern or southern latitudes compared to an equirectangular metric projection.

---

## 5. Route Snapper Search Window & Cutoffs

`RouteSnapper` prioritizes execution speed by restricting its search to a localized window:
- **Search Window Size (`SNAP_WINDOW_SIZE`)**: `25` segments forward from the current progress index.
- **Hard Distance Cutoff (`MAX_SNAP_DISTANCE`)**: `80` metres. Fixes further than $2 \times 80\text{m} = 160\text{m}$ from the nearest segment are skipped entirely.
- If a vehicle makes an unannounced shortcut jumping across more than 25 segments, the snapper will not snap to the distant forward segment until progress catches up or a reroute is loaded.

---

## 6. MapLibre Adapter Targets Web DOM Only

The legacy/internal `MapLibreAdapter` (in `@ingissa/navcore-maplibre`) is built specifically for `maplibre-gl` in browser environments (manipulating DOM `HTMLElement` markers). It cannot be used with React Native. React Native apps should render markers and polylines directly using `@rnmapbox/maps` or `react-native-maps`.

---

## 7. License Key Security Boundaries

- **No Runtime Bundle ID Check**: The `bid` string contained in the license key is parsed but not validated against the runtime host application identifier.
- **Client Key Extractability**: Embedding license keys in client-side code (e.g. `EXPO_PUBLIC_NAVCORE_LICENSE_KEY`) makes the key readable to any end-user inspecting application assets.
- **Not DRM**: The license system is an offline customer entitlement validator, not an anti-tamper or DRM protection mechanism.