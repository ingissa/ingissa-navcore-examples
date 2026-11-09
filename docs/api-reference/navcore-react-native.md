# `@ingissa/navcore-react-native` API Reference

Complete API reference for `@ingissa/navcore-react-native` (version 1.0.9).

---

## 1. Context Provider

### `NavCoreProvider`
Context provider component that instantiates and shares a single `NavCore` engine instance across child components.

```tsx
function NavCoreProvider({ children, options }: NavCoreProviderProps): JSX.Element;
```

#### Props (`NavCoreProviderProps`)
- `children`: `ReactNode`
- `options?: NavCoreOptions`: Engine configuration options passed to `new NavCore(options)`.

### `useNavCoreContext()`
Retrieves the shared engine instance from context.
```typescript
function useNavCoreContext(): { engine: NavCore };
```
*Throws an error if invoked outside of `<NavCoreProvider>`.*

---

## 2. Granular Selector Hooks

### `useNavSelector<T>`
Generic reactive selector subscribing to NavCore state updates via `useSyncExternalStore`. Only triggers a re-render when the selected value actually changes.

```typescript
function useNavSelector<T>(
  selector: (state: NavCoreState) => T,
  customEngine?: NavCore,
  isEqual: (a: T, b: T) => boolean = Object.is
): T;
```

### `useNavInstruction(customEngine?: NavCore): NavInstruction | null`
Selects the upcoming turn-by-turn navigation instruction.
- **Re-render trigger**: Re-renders only when instruction text, location, or `geometryIndex` changes.

### `useNavAlert(customEngine?: NavCore): NavCoreState['alertState']`
Selects the current deviation and recalculation state.
- **Return values**: `'NONE' | 'DEVIATING' | 'RECALCULATING' | 'REJOINING' | 'REJOINED'`.
- **Re-render trigger**: Re-renders only on alert state transitions.

### `useNavProgress(customEngine?: NavCore): NavProgressInfo`
Selects distance metrics and arrival progress.
```typescript
interface NavProgressInfo {
  distanceToDestination: number | null;
  distanceToNextInstruction: number | null;
  progressIndex: number;
  routeIndex: number;
  hasArrived: boolean;
}
```

### `useNavIsOffRoute(customEngine?: NavCore): boolean`
Returns `true` when the vehicle is currently deviating or off-route.

### `useNavSpeed(customEngine?: NavCore): number`
Returns current ground speed in metres per second (`m/s`).

---

## 3. Lifecycle Hook (`useNavCore`)

### `useNavCore(props: UseNavCoreProps): UseNavCoreReturn`
High-level lifecycle hook managing coordinate feeding, event subscription, and cleanup:

```typescript
interface UseNavCoreProps {
  gpsCoord?: Coordinate | null;
  gpsBearing?: number | null;
  gpsAccuracy?: number | null;
  gpsTimestamp?: number | null;
  speed?: number | null;
  routeGeometry?: Coordinate[] | null;
  instructions?: NavInstruction[] | null;
  isNavigating?: boolean;
  options?: NavCoreOptions;
  resumeAtIndex?: number;
  outputRef?: React.MutableRefObject<any>;
  onDeviation?: (data: { anchorIndex: number; ghostCoord: Coordinate }) => void;
  onRejoin?: (data: { resumeIndex: number }) => void;
  onInstruction?: (instruction: NavInstruction) => void;
  onArrival?: () => void;
  pollRateHz?: number;
}

interface UseNavCoreReturn {
  state: NavCoreState;
  engine: NavCore;
  isReady: boolean;
}
```