# Installation & Packaging Guide

This document details package installation, peer dependencies, subpath imports, and runtime configuration for NavCore 1.0.9.

---

## Public Packages Matrix (1.0.9)

Only the following **five packages** are published and maintained in 1.0.9:

| Package | Version | Runtime Dependencies | Required Peer Dependencies | Optional Peer Dependencies |
|---|---|---|---|---|
| `@ingissa/navcore-core` | `1.0.9` | 0 | None | None |
| `@ingissa/navcore-types` | `1.0.9` | 0 | None | None |
| `@ingissa/navcore-mapbox` | `1.0.9` | 0 | `@ingissa/navcore-core: ^1.0.9` | `@rnmapbox/maps: >=10.0.0` |
| `@ingissa/navcore-react-native` | `1.0.9` | 0 | `@ingissa/navcore-core: ^1.0.9`<br>`react: >=18.0.0`<br>`react-native: >=0.72.0` | `react-native-maps: >=1.0.0` |
| `@ingissa/navcore-simulator` | `1.0.9` | 0 | `@ingissa/navcore-core: ^1.0.9` | `react: >=18`<br>`react-native: >=0.72` |

> [!WARNING]
> **Deprecated Packages Warning:**
> The `1.0.7` and `1.0.8` releases of `@ingissa/navcore-react-native` and `@ingissa/navcore-simulator`, as well as the `1.0.8` releases of `@ingissa/navcore-mapbox` and `@ingissa/navcore-types`, contained broken entrypoints and are deprecated on npm. **Always install version `1.0.9`.**

> [!CAUTION]
> **Unpublished Packages:**
> Legacy or internal packages `@ingissa/navcore-google-maps`, `@ingissa/navcore-headless`, `@ingissa/navcore-leaflet`, and `@ingissa/navcore-maplibre` are **private** (not published in 1.0.9). Do not attempt to `npm install` them. Map rendering is managed in userland by binding state to your UI map of choice.

---

## Installation Commands

### Core Engine Only (Web, Node.js, CLI)
```bash
npm install @ingissa/navcore-core
```

### React Native / Expo Applications
```bash
npm install @ingissa/navcore-core @ingissa/navcore-react-native
```

### Mapbox Routing
```bash
npm install @ingissa/navcore-core @ingissa/navcore-mapbox
```

### Headless Simulation & Testing
```bash
npm install @ingissa/navcore-core @ingissa/navcore-simulator
```

---

## Subpath Imports

All packages in 1.0.9 ship with flat distribution entries (`dist/`) containing ESM (`.mjs`), CommonJS (`.js`), and TypeScript type declarations (`.d.ts`).

### 1. `@ingissa/navcore-core` Subpaths

- **`@ingissa/navcore-core` (Root)**:
  Unified entry point. Exports `NavCore`, `createNavigationSession`, `RoutePlan`, `createRoutePlan`, built-in providers (`OSRMDirectionsProvider`, `ValhallaDirectionsProvider`, `OpenRouteServiceProvider`), and all helper math.
  ```typescript
  import { createNavigationSession, OSRMDirectionsProvider } from '@ingissa/navcore-core';
  ```

- **`@ingissa/navcore-core/core`**:
  Core algorithms only (Kalman filtering, basic snapping, cumulative distance calculations, route builder, and providers). Zero gated features.
  ```typescript
  import { KalmanFilter2D, RouteSnapper } from '@ingissa/navcore-core/core';
  ```

- **`@ingissa/navcore-core/pro`**:
  Advanced engine features (dead reckoning, compound deviation detector, ETA engine, geofencing engine, voice trigger engine, and FSMs).
  ```typescript
  import { DeadReckoningEngine, ETAEngine } from '@ingissa/navcore-core/pro';
  ```

### 2. `@ingissa/navcore-simulator` Subpaths

- **`@ingissa/navcore-simulator` (Root)**:
  Universal entry exporting engine, scenario injectors, noise models, and React Native controls.
  ```typescript
  import { SimulatorEngine, NoiseEngine } from '@ingissa/navcore-simulator';
  ```

- **`@ingissa/navcore-simulator/node`**:
  Node.js and CI runner export. Contains pure JavaScript/TypeScript engines with zero DOM or React Native dependencies:
  ```typescript
  import { SimulatorEngine, ScenarioInjector } from '@ingissa/navcore-simulator/node';
  ```

- **`@ingissa/navcore-simulator/react-native`**:
  Mobile export with React Native hooks and UI components:
  ```typescript
  import { useSimulator, SimulatorControls } from '@ingissa/navcore-simulator/react-native';
  ```

---

## React Native & Expo Considerations

### 1. Peer Dependency Resolution with npm 7+

In React Native projects using React 18, npm 7+ strict peer dependency resolution may flag minor mismatch warnings between `react-native@0.72` and `react@18.3`. If installation is blocked, add the flag:

```bash
npm install --legacy-peer-deps
```

Or configure an override in your root `package.json`:
```json
{
  "overrides": {
    "@types/react": "^18.3.1"
  }
}
```

### 2. Environment Variables & Secret Safety

When loading license keys in Expo or React Native apps, variables prefixed with `EXPO_PUBLIC_` (e.g. `EXPO_PUBLIC_NAVCORE_LICENSE_KEY`) are bundled into client JavaScript. They are readable by end users and must **never** be used to store private backend credentials. See [Licensing & Verification](./licensing.md) for details.