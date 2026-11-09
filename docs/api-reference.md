# NavCore SDK API Reference

Welcome to the NavCore SDK API documentation. For detailed, per-package symbol references, see the [API Reference Directory](./api-reference/README.md).

---

## Package Directory

| Package | Scope | Reference Document |
|---|---|---|
| [`@ingissa/navcore-core`](./api-reference/navcore-core.md) | Navigation engine, Kalman filter, snapper, FSMs, route planning, dead reckoning, and built-in directions providers. Subpaths: `.`, `./core`, `./pro`. | [Core API Reference](./api-reference/navcore-core.md) |
| [`@ingissa/navcore-react-native`](./api-reference/navcore-react-native.md) | React Native bindings, context provider (`NavCoreProvider`), and granular state selector hooks (`useNavSelector`, `useNavInstruction`, etc.). | [React Native API Reference](./api-reference/navcore-react-native.md) |
| [`@ingissa/navcore-simulator`](./api-reference/navcore-simulator.md) | Headless GPS simulation engine, noise models, scenario injection, and React Native UI controls. Subpaths: `.`, `./node`, `./react-native`. | [Simulator API Reference](./api-reference/navcore-simulator.md) |
| [`@ingissa/navcore-mapbox`](./api-reference/navcore-mapbox.md) | Mapbox Directions API provider adapter with automatic waypoint chunking. | [Mapbox API Reference](./api-reference/navcore-mapbox.md) |
| [`@ingissa/navcore-types`](./api-reference/navcore-types.md) | Shared domain interfaces and type definitions used across the ecosystem. | [Types API Reference](./api-reference/navcore-types.md) |

---

## Quick Reference: Primary Integration APIs

### `NavigationSession`
```typescript
import { createNavigationSession, OSRMDirectionsProvider } from '@ingissa/navcore-core';

const nav = createNavigationSession({
  provider: new OSRMDirectionsProvider({ baseUrl: 'https://router.project-osrm.org' }),
  engineOptions: { isDev: true },
});

// A. Origin & Destination
await nav.navigate({ origin: [-6.84, 34.02], destination: [-6.80, 34.04] });

// B. Ordered routing waypoints
await nav.navigate({ coordinates: [[-6.84, 34.02], [-6.82, 34.03], [-6.80, 34.04]] });

// Typed subscriptions
const unsubscribe = nav.subscribe('instruction', (instr) => console.log(instr.text));
```

### `NavCore` Constructor Options (`NavCoreOptions`)
```typescript
interface NavCoreOptions {
  licenseKey?: string;           // Commercial key (default: '')
  isDev?: boolean;                // Developer bypass (default: false)
  isCircuit?: boolean;            // Closed-loop circuit route (default: false)
  kalmanQ?: number;               // Process noise (default: 0.00001)
  kalmanRBase?: number;           // Measurement noise base (default: 0.00005)
  baseCorridorMeters?: number;    // Corridor at low speed (default: 25)
  maxCorridorMeters?: number;     // Corridor ceiling (default: 60)
  arrivalThresholdMeters?: number;// Arrival detection radius (default: 30)
  bearingSmoothingAlpha?: number; // Heading EMA alpha (default: 0.3)
}
```

> [!WARNING]
> **Client-Side Environment Variables Notice:**
> Any environment variable prefixed with `EXPO_PUBLIC_` (such as `EXPO_PUBLIC_NAVCORE_LICENSE_KEY`) is bundled in plaintext into the client application binary. Never use it to store private backend credentials. See [Licensing & Verification](./licensing.md) for full security specifications.