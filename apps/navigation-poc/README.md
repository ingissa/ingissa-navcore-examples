# NavCore Navigation POC

> **Official primary example** of the Navcore SDK 2.0.0 — Expo / React Native application demonstrating a complete navigation pipeline with MapLibre and local Valhalla routing.

## What it demonstrates

| Feature | Detail |
|---|---|
| **End-to-end navigation** | Valhalla local routing → NavCore → MapLibre rendering |
| **Deviation from current position** | "Simulate deviation here" button — no route reset |
| **OFF_ROUTE confirmation** | NavCore FSM: 2-second GPS-timestamp window |
| **Valhalla reroute** | Recalculate from exact off-route position to original destination |
| **Corridor visualization** | Route, corridor, GPS trail, snapped trail, deviation trajectory |
| **Diagnostic HUD** | 10 metrics, collapsible, live FSM states |
| **Vehicle asset** | PNG symbol with NavCore bearing, positioned on snapped coord |
| **Foreground GPS** | Real device location permission and tracking |

## Prerequisites

- Node.js 20+
- Expo CLI (`npx expo`)
- Android emulator or physical Android device with Expo Dev Client
- Local Valhalla server (see [docs/local-valhalla.md](../../docs/local-valhalla.md))

## Setup

```bash
# 1. Install dependencies
cd apps/navigation-poc
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env: set EXPO_PUBLIC_VALHALLA_URL and EXPO_PUBLIC_NAVCORE_APPLICATION_ID

# 3. Start the dev server
npx expo start --dev-client
```

## Navigation States

| HUD Label | Meaning |
|---|---|
| `ON ROUTE` | Vehicle is within the corridor, navigation active |
| `APPROACHING ROUTE` | Session started, moving toward route start |
| `DEVIATION · CONFIRMING FOR 2 s` | Outside corridor — NavCore FSM accumulating GPS time |
| `OFF ROUTE · CONFIRMED` | 2 s elapsed outside corridor — reroute triggered |
| `RECALCULATING · REQUESTED` | Valhalla request dispatched |
| `RECALCULATING · RECEIVED` | Valhalla responded, applying new route |
| `RECALCULATING · RESUMING` | New route loaded, navigation restarting |

## Deviation scenario

1. Start a navigation session (use GPS or tap a point on the map)
2. Wait until `ON ROUTE` is displayed
3. Tap **"Simulate deviation here"** to trigger a 10-second, 51-point GPS trajectory
4. Observe `DEVIATION · CONFIRMING FOR 2 s` — NavCore is timing the breach
5. After ~2 seconds, `OFF ROUTE · CONFIRMED` appears and reroute begins
6. The pink-dashed trajectory shows the simulated path; the red trail marks the confirmed deviation

## SDK Packages Used

| Package | Version | Role |
|---|---|---|
| `@ingissa/navcore-core` | `^2.0.0` | Navigation engine, FSM, corridor |
| `@ingissa/navcore-react-native` | `^2.0.0` | Hooks, `useNavCore`, selectors |
| `@ingissa/navcore-simulator` | `^2.0.0` | Deviation trajectory generator |

## Known limitations

- Android only (iOS not tested)
- No background location support
- Requires internet for OpenFreeMap tiles (Valhalla can be fully local)
- No production voice guidance
- No offline maps
