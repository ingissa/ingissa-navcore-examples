# NavCore SDK — Examples Suite & Documentation

> **Version 2.1.0** — Harmonized for the NavCore V2 ecosystem and License v0.2.

Standalone, runnable examples and complete documentation for the NavCore SDK. All examples are runnable with `npx tsx`.

---

## Repository Structure (V2)

```
ingissa-navcore-examples/
├── apps/
│   └── navigation-poc/     <- Primary app: full Expo/React Native navigation demo
├── docs/                   <- SDK guides and API reference
├── 01-basic-navigation/    <- TypeScript examples 01-11 (see table below)
└── ...
```

### Running the Primary App (`navigation-poc`)

```bash
cd apps/navigation-poc
npm install
npx expo start --dev-client
```

See [`apps/navigation-poc/README.md`](./apps/navigation-poc/README.md) ([Version française](./apps/navigation-poc/README.fr.md)) for full instructions and scenario guide.

---

## Prerequisites

```bash
npm install
```

---

## Running the Examples

| # | Example Name | Feature Demonstrated | How to Run | Network? |
|---|---|---|---|---|
| 01 | [Basic Navigation](./01-basic-navigation/) | `createNavigationSession`, OSRM, typed events | `npx tsx 01-basic-navigation/index.ts` | ✅ OSRM |
| 02 | [Custom Route Builder](./02-custom-route-builder/) | `CustomRouteBuilder`, GPX/GeoJSON export, chunking | `npx tsx 02-custom-route-builder/index.ts` | ✅ OSRM |
| 03 | [Instruction Editor](./03-instruction-editor/) | `InstructionEditor`, checkpoints, maneuvers | `npx tsx 03-instruction-editor/index.ts` | ✅ OSRM |
| 04 | [MapLibre Web](./04-maplibre-web/) | MapLibre GL JS browser navigation UI generator | `npx tsx 04-maplibre-web/index.ts > maplibre.html` | ✅ OSRM |
| 05 | [Leaflet Web](./05-leaflet-web/) | Leaflet.js browser navigation UI generator | `npx tsx 05-leaflet-web/index.ts > leaflet.html` | ✅ OSRM |
| 06 | [Directions Providers](./06-directions-providers/) | Multi-provider routing (OSRM, Valhalla, ORS, Mapbox) | `npx tsx 06-directions-providers/index.ts` | ✅ All providers |
| 07 | [Voice Triggers](./07-voice-triggers/) | `VoiceTriggerEngine`, priority cues, TTS timing | `npx tsx 07-voice-triggers/index.ts` | ✅ OSRM |
| 08 | [ETA Engine](./08-eta-engine/) | `ETAEngine`, rolling average speed, stop handling | `npx tsx 08-eta-engine/index.ts` | ✅ OSRM |
| 09 | [Geofencing](./09-geofencing/) | `GeofencingEngine`, circle/polygon zones, dwell | `npx tsx 09-geofencing/index.ts` | ❌ None (Offline) |
| 10 | [Parallel Road Resolver](./10-parallel-road-resolver/) | `ParallelRoadResolver`, U-turn anti-snap | `npx tsx 10-parallel-road-resolver/index.ts` | ❌ None (Offline) |
| 11 | [Headless Testing](./11-headless-testing/) | Automated CI/CD navigation verification | `npx tsx 11-headless-testing/index.ts` | ✅ OSRM |

> [!NOTE]
> Examples 09 (`09-geofencing`) and 10 (`10-parallel-road-resolver`) run 100% offline without any network connectivity.

---

## Documentation Index

- **Core & Concepts:**
  - [Getting Started Guide](./docs/getting-started.md)
  - [Installation Matrix](./docs/installation.md)
  - [Pipeline Architecture & State Machines](./docs/concepts.md)
  - [Directions Providers](./docs/directions-providers.md)
- **Platforms:**
  - [React Native Integration Guide](./docs/react-native.md)
  - [GPS Simulation & Replay Guide](./docs/simulator.md)
- **Reference & Operations:**
  - [100% Export API Reference](./docs/api-reference/)
  - [Licensing & Offline Verification](./docs/licensing.md)
  - [Known Limitations](./docs/limitations.md)
  - [Troubleshooting](./docs/troubleshooting.md)
  - [Migration Guide](./docs/migration-1.0.4-to-1.0.9.md)
