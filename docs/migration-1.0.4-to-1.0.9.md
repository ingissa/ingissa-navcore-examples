# Migration Guide: Upgrading from 1.0.4 to 1.0.9

This guide outlines breaking changes, new APIs, and architectural upgrades between NavCore 1.0.4 and 1.0.9.

---

## 1. Packaging & Distribution Changes

### Flat Distribution Layout
- In 1.0.4, tarballs contained internally chunked and hashed files (e.g. `dist/index-i9TY71RY.d.ts`).
- In 1.0.9, all packages are bundled with `tsup` into clean, predictable flat entries:
  - CommonJS: `dist/index.js`
  - ESM: `dist/index.mjs`
  - TypeScript types: `dist/index.d.ts`

### Unbundled Adapters & Peer Dependencies
In 1.0.4, adapter packages bundled private internal copies of `@ingissa/navcore-core`, causing duplicate engine instances and conflicting `instanceof` checks.

In 1.0.9, adapters declare `@ingissa/navcore-core` as an external `peerDependency` (`^1.0.9`). You must declare both packages in your `dependencies`:

```bash
# 1.0.9 requirement:
npm install @ingissa/navcore-core @ingissa/navcore-react-native
```

### Deprecated Intermediary Releases (1.0.7 & 1.0.8)
Releases `1.0.7` and `1.0.8` suffered from packaging entrypoint defects and have been formally deprecated on npm. Direct upgrades from `1.0.4` to `1.0.9` are recommended.

---

## 2. API Additions in 1.0.9

### High-Level `NavigationSession`
NavCore 1.0.9 introduces `NavigationSession`, automating the route fetch, normalization, engine load, and event lifecycle.

#### Before (1.0.4):
```typescript
import { NavCore, OSRMDirectionsProvider } from '@ingissa/navcore-core';

const provider = new OSRMDirectionsProvider({ baseUrl: 'https://router.project-osrm.org' });
const result = await provider.getRoute([[2.3522, 48.8566], [2.3009, 48.8741]]);

const engine = new NavCore({ isDev: true });
engine.setRoute(result.geometry);
engine.startNavigation();

engine.on('instruction', (instr) => console.log(instr.text));
```

#### After (1.0.9):
```typescript
import {
  createNavigationSession,
  OSRMDirectionsProvider,
} from '@ingissa/navcore-core';

const nav = createNavigationSession({
  provider: new OSRMDirectionsProvider({ baseUrl: 'https://router.project-osrm.org' }),
  engineOptions: { isDev: true },
});

const unsubscribe = nav.subscribe('instruction', (instr) => console.log(instr.text));

// Supports origin/destination or ordered routing waypoints
await nav.navigate({
  origin: [2.3522, 48.8566],
  destination: [2.3009, 48.8741],
});
```

---

### Route Normalization (`RoutePlan` & `createRoutePlan`)
Directions providers return vendor-specific maneuver steps. `createRoutePlan` projects each maneuver onto the route segments to calculate exact sub-segment cumulative offsets:

```typescript
import { createRoutePlan } from '@ingissa/navcore-core';

// Converts vendor result into immutable RoutePlan
const plan = createRoutePlan(directionsResult, { provider: 'osrm' });
engine.loadRoute(plan);
```

---

### Granular React Native Hooks
In 1.0.4, React Native integrations relied on full-engine state polling. 1.0.9 introduces six granular selector hooks built with `useSyncExternalStore`:

| New Hook (1.0.9) | Purpose |
|---|---|
| `useNavSelector(selector)` | Subscribes to an arbitrary state slice with equality checking |
| `useNavInstruction()` | Upcoming turn instruction (only re-renders on maneuver change) |
| `useNavAlert()` | Deviation / recalculation alert state (`'NONE'` \| `'DEVIATING'` \| `'RECALCULATING'` \| `'REJOINING'`) |
| `useNavProgress()` | Structured distance remaining and arrival status |
| `useNavIsOffRoute()` | Boolean off-route indicator |
| `useNavSpeed()` | Current ground speed in m/s |

#### Before (1.0.4):
```tsx
// Re-rendered entire component tree on every 1-10Hz GPS tick
const { state } = useNavCore({ ...props });
return <Text>{state.currentSpeed}</Text>;
```

#### After (1.0.9):
```tsx
// Only re-renders when speed value changes
const speed = useNavSpeed();
return <Text>{Math.round(speed * 3.6)} km/h</Text>;
```

---

### Simulator Subpath Exports & Mobile UI
In 1.0.9, `@ingissa/navcore-simulator` provides subpath exports to prevent React or DOM dependencies from leaking into Node.js CI:
- `@ingissa/navcore-simulator/node`: Headless for automated test suites.
- `@ingissa/navcore-simulator/react-native`: Includes `useSimulator` hook and `SimulatorControls` overlay.