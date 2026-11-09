# `@ingissa/navcore-types` API Reference

Complete API reference for `@ingissa/navcore-types` (version 1.0.9). Contains shared domain models, lifecycle enums, and coordinate contracts.

---

## 1. Coordinate & Route Models

- `Coord`: Coordinate tuple `[number, number]` in `[longitude, latitude]` order.
- `CustomWaypoint`: Waypoint entity with `{ id: string; coord: Coord; name?: string; silent?: boolean }`.
- `CustomRoute`: Route entity with waypoints and generated geometry.
- `CustomRouteBuilderInterface`: Contract defining methods for adding, inserting, moving, and chunking route waypoints.
- `WaypointOptions`: Options for route builder waypoints (`name`, `silent`).
- `BuildOptions`: Options for compiling route geometry (`profile`).
- `RouteOptions`: Route computation options.
- `RouteResult`: Route result with `geometry`, `distance`, `duration`, `legs`.
- `RouteLeg`: Route leg containing distance, duration, and steps.
- `RouteStep`: Step containing maneuvers and geometry.
- `DirectionsProvider`: Generic interface for route calculation backends.
- `SnapResult`: Snapping result with segment index `idx`, distance `dist`, and projected coordinate `proj`.
- `FeatureCollection`: GeoJSON feature collection abstraction.

---

## 2. Navigation State & Lifecycle

- `NavCoreState`: Comprehensive state snapshot produced on every engine tick (snapped position, bearing, speed, distance remaining, alert state).
- `NavGpsUpdate`: Input payload fed into `engine.update()`.
- `NavInstruction`: Maneuver turn instruction projected on route geometry.
- `NavLifecycleState`: Lifecycle states: `'IDLE' | 'OVERVIEW' | 'APPROACHING_ROUTE' | 'ON_ROUTE'`.
- `NavOptions`: Engine options interface.
- `CameraTarget`: Camera target coordinate and zoom parameters.
- `LineStyle`: Polyline styling configuration.

---

## 3. Alerts & Deviation

- `AlertEvent`: Alert notification payload for UI warning banners.
- `DeviationEvent`: Off-route deviation alert payload containing segment index and ghost projection coordinate.
- `TriggerCondition`: Trigger criteria for custom route triggers.

---

## 4. Dead Reckoning

- `DRAnchor`: Anchor snapshot containing timestamp, linear offset, and speed.
- `DRPrediction`: Dead-reckoned position prediction containing coordinate, bearing, and progress offset.

---

## 5. Milestone & Instruction Extensions

- `ExamInstruction`: Extended instruction with domain milestones.
- `ExamAction`: Action associated with a route milestone.
- `ExamHazardZone`: Geometric bounding zone representing an alert area.

---

## 6. Licensing & Renderers

- `LicenseStatus`: License verification state (`'VALID' | 'INVALID' | 'EXPIRED' | 'MISSING'`).
- `NavLicenseInfo`: License payload metadata.
- `FeatureKey`: Unique string identifier for gated feature entitlements.
- `NavCoreRenderer`: Abstract map rendering contract.
- `HeadlessRenderer`: Mock headless renderer for test environments implementing `NavCoreRenderer`.