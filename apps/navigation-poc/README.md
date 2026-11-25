# NavCore Navigation POC

> **Official primary example** for NavCore SDK **2.1.0** — Expo / React Native application demonstrating a complete turn-by-turn navigation pipeline with MapLibre and local Valhalla routing.
>
> [Version française (README.fr.md)](./README.fr.md)

This directory is the official POC integration inside `ingissa-navcore-examples`. It is a **living reference app maintained alongside the SDK**, not a static demo.

---

## What This POC Demonstrates

| Feature | Details |
|---|---|
| **End-to-end navigation** | Local Valhalla → NavCore → MapLibre rendering |
| **Live deviation from current position** | `"Simulate deviation here"` button — without resetting the route |
| **OFF_ROUTE confirmation** | NavCore FSM: 2-second window driven by GPS timestamps |
| **Valhalla rerouting** | Recalculates from the exact off-corridor position to the original destination |
| **Corridor visualization** | Route, corridor, raw GPS trace, snapped trace, simulated deviation trajectory |
| **Diagnostic HUD** | 10 real-time metrics, collapsible panel, live FSM states |
| **Vehicle asset** | PNG symbol rotated by NavCore bearing on the snapped coordinate |
| **Foreground GPS** | Permission handling and real-device tracking |
| **Scenario replay** | Reproducible JSON navigation scenario fixtures |

> [!IMPORTANT]
> This POC demonstrates the key V2 deterministic behavior: a persistent corridor breach transitions the state from `DEVIATING` to `OFF_ROUTE` using **GPS timestamps** (rather than React render cadence), ensuring consistent behavior regardless of device frame rate.

---

## Pipeline Architecture

```text
GPS fix
  → filtering / bearing
  → snapping onto route geometry
  → dynamic corridor
  → OffRouteFSM (DEVIATING → OFF_ROUTE after 2s GPS time)
  → progress / instructions / public state
  → MapLibre rendering + Valhalla rerouting
```

### SDK Packages Used

| Package | Version | Role |
|---|---|---|
| `@ingissa/navcore-core` | `^2.1.0` | Navigation engine, FSM, corridor |
| `@ingissa/navcore-react-native` | `^2.1.0` | React Native hooks, `useNavCore`, selectors |
| `@ingissa/navcore-simulator` | `^2.1.0` | Deviation trajectory generator |

---

## Prerequisites

- Node.js 20+
- `npx expo` (Expo CLI)
- Android emulator or physical Android device with Expo Dev Client
- Local Valhalla server (see [Directions Providers](../../docs/directions-providers.md)) or fixture mode
- Optional NavCore Suite license key for Pro modules in production (see [Licensing & Offline Verification](../../docs/licensing.md))

---

## Installation

```bash
cd apps/navigation-poc
npm install
```

---

## Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
APP_VARIANT=development
EXPO_PUBLIC_ROUTE_MODE=valhalla
EXPO_PUBLIC_VALHALLA_URL=http://10.0.2.2:8002
EXPO_PUBLIC_NAVCORE_LICENSE_KEY=<your-license-key>
EXPO_PUBLIC_NAVCORE_APPLICATION_ID=com.udereva.app
EXPO_PUBLIC_NAVCORE_DEV_MODE=false
```

> [!NOTE]
> `10.0.2.2` resolves to the host machine from an Android emulator. On a physical device, use the local LAN IP of the machine running Valhalla.

> [!NOTE]
> `EXPO_PUBLIC_ROUTE_MODE=fixture` lets you test without a running Valhalla server by using the bundled JSON fixtures.

> [!NOTE]
> `EXPO_PUBLIC_NAVCORE_DEV_MODE=true` (`isDev: true`) unlocks Pro modules **only in non-production builds**. In release/production builds (`globalThis.__DEV__ === false` or `NODE_ENV === 'production'`), `isDev` is ignored and a valid Suite license key bound to `applicationId` is required for Pro modules.

---

## Running the App

```bash
# Dev server
npx expo start --dev-client

# Direct Android build
npx expo run:android
```

---

## Navigation States (HUD)

| HUD Label | Meaning |
|---|---|
| `ON ROUTE` | Vehicle inside corridor, active navigation |
| `APPROACHING ROUTE` | Session started, moving toward route start |
| `DEVIATION · CONFIRMING FOR 2 s` | Outside corridor — NavCore FSM accumulating GPS time |
| `OFF ROUTE · CONFIRMED` | 2s elapsed outside corridor — rerouting triggered |
| `RECALCULATING · REQUESTED` | Valhalla request dispatched |
| `RECALCULATING · RECEIVED` | Valhalla responded, applying new route |
| `RECALCULATING · RESUMING` | New route loaded, navigation resumed |

---

## Deviation Scenario (Main Demo)

1. Start a navigation session (real GPS or map point)
2. Wait for the `ON ROUTE` state
3. Tap **"Simulate deviation here"** — triggers a simulated 10s / 51-point GPS trajectory from the current position
4. Observe `DEVIATION · CONFIRMING FOR 2 s` — NavCore times the corridor breach
5. After ~2 seconds, `OFF ROUTE · CONFIRMED` appears and rerouting begins
6. The dashed pink trajectory shows the simulated path; the red trace marks the confirmed deviation

> [!NOTE]
> The simulated trajectory is **visually distinct** (dashed pink). Real GPS behavior is separate from simulation mode.

---

## Replay Modes

| Env Variable | Value | Effect |
|---|---|---|
| `EXPO_PUBLIC_ROUTE_MODE` | `fixture` | Uses bundled JSON fixtures instead of Valhalla |
| `EXPO_PUBLIC_NAVCORE_REPLAY_DIAGNOSTICS` | `true` | Detailed replay diagnostics logs |
| `EXPO_PUBLIC_NAVCORE_CAPTURED_REPLAY` | `true` | Replays a captured wrong-turn GPS trace |

---

## Project Structure

```text
apps/navigation-poc/
├── App.tsx                          # Root component and full orchestration
├── app.json / app.config.js         # Expo configuration
├── metro.config.js                  # Metro configuration
├── tsconfig.json                    # Strict TypeScript config
├── index.ts                         # Expo entry point
├── .env.example                     # Documented environment variables
├── assets/                          # App icons and vehicle sprite
├── plugins/
│   └── withAndroidCleartextTraffic.js  # Expo plugin (APP_VARIANT=development HTTP only)
├── src/
│   ├── components/
│   │   └── GuidanceMap.tsx          # MapLibre map + overlays
│   ├── location/
│   │   ├── locationSample.ts        # GPS sample types
│   │   └── useForegroundLocation.ts # Foreground GPS hook
│   ├── navigation/
│   │   ├── atomicSessionStart.ts    # Atomic session startup
│   │   ├── freshReroute.ts          # Rerouting from current position
│   │   ├── licenseRuntimeDiagnostics.ts
│   │   ├── navigationViewModel.ts   # HUD/state ViewModel
│   │   ├── rerouteAttemptCoordinator.ts
│   │   ├── timestampedReplay.ts     # Replay with real GPS timestamps
│   │   ├── types.ts                 # Internal types
│   │   ├── useNavigationSession.ts  # Navigation session hook
│   │   ├── useReplaySource.ts       # GPS source: real or replay
│   │   ├── useRerouteOnOffRoute.ts  # Reroute trigger
│   │   ├── wrongTurnReplay.ts       # Wrong-turn scenario
│   │   └── fixtures/
│   │       └── capturedWrongTurnReplay.ts
│   └── routing/
│       ├── routeMetrics.ts          # Progress and distance helpers
│       ├── valhallaAdapter.ts       # Valhalla → NavCore route adapter
│       ├── valhallaClient.ts        # Valhalla HTTP client
│       └── valhallaFixture.ts       # Static Valhalla fixture
└── tests/
    └── fixtures/
        └── navigation/
            └── key-mode-fixtures.json  # Reproducible GPS scenarios
```

---

## Known Limitations

- Android only (iOS untested)
- No background location tracking
- OpenFreeMap tiles require internet connectivity (Valhalla can run 100% locally)
- No production voice guidance TTS integration
- No offline map tiles
- Offline license revocation is not instantaneous (inherent to offline ECDSA verification)
