# 12 — Expo Complete Navigation Examples

A suite of **four production-quality navigation screens** built with the `@ingissa/navcore-sdk`. Each screen demonstrates the same core NavCore feature set (route snapping, ETA, voice cues, off-route detection, GPS simulation) rendered via a different map library.

---

## 📁 Directory Structure

```
12-expo-complete-navigation/
├── leaflet/        ✅ Expo Go compatible  (Leaflet + WebView + OSRM)
├── google/         ⚠️  Expo Go (needs Google Maps API key + Google Play)
├── mapbox/         🔧 Dev Build required  (@rnmapbox/maps)
└── maplibre/       🔧 Dev Build required  (@maplibre/maplibre-react-native)
```

---

## 🗺️ Compatibility Matrix

| Variant | Map Library | Directions | Works in Expo Go | Needs API Key |
|---------|-------------|------------|-----------------|--------------|
| **Leaflet** | Leaflet.js (WebView) | OSRM (free) | ✅ Yes | ❌ None |
| **Google** | react-native-maps | OSRM (free) | ⚠️ Partial\* | ✅ Google Maps |
| **Mapbox** | @rnmapbox/maps | Mapbox API | 🔧 Dev Build | ✅ Mapbox Public + Secret |
| **MapLibre** | @maplibre/maplibre-react-native | Valhalla (free) | 🔧 Dev Build | ❌ None |

> \* Google Maps renders tiles in Expo Go only if Google Play Services is available on the device/emulator **and** a valid API key is provided.

---

## ✨ Features Demonstrated

All four variants demonstrate the same NavCore SDK features:

| Feature | API |
|---------|-----|
| Route fetching | `OSRMDirectionsProvider` / `MapboxDirectionsProvider` / `ValhallaDirectionsProvider` |
| Navigation engine | `useNavCore` |
| Kalman-filtered GPS | `useNavCore` options |
| Route snapping | `navState.snappedCoord` |
| Off-route detection | `navState.isOffRoute` |
| Turn-by-turn instructions | `NavInstruction[]` → `navState.nextInstructionIndex` |
| Rolling ETA | `ETAEngine` |
| Proximity voice cues | `VoiceTriggerEngine` |
| Synthetic GPS simulation | `useSimulator` |
| Arrival detection | `onArrival` callback |
| Deviation detection | `onDeviation` callback |

---

## 🚀 Getting Started

### Prerequisites

Make sure you have installed all dependencies from the monorepo root:

```bash
# From monorepo root
npm install --legacy-peer-deps
npx expo start --clear
```

### Switching Between Variants

Edit `App.tsx` at the monorepo root:

```tsx
import LeafletExample from './packages/navcore-sdk/examples/12-expo-complete-navigation/leaflet/index';
import GoogleExample  from './packages/navcore-sdk/examples/12-expo-complete-navigation/google/index';
import MapboxExample  from './packages/navcore-sdk/examples/12-expo-complete-navigation/mapbox/index';
import MapLibreExample from './packages/navcore-sdk/examples/12-expo-complete-navigation/maplibre/index';

export default function App() {
    return <LeafletExample />;   // ← change this line to switch variants
    // return <GoogleExample />;
    // return <MapboxExample />;
    // return <MapLibreExample />;
}
```

---

## 📱 Variant Setup Guides

### 1. Leaflet (Expo Go — No Setup Required)

The easiest starting point. Uses a `WebView` with Leaflet.js loaded from CDN.

```bash
npx expo start
# Press 'a' for Android or 'i' for iOS
```

**Route**: Live Casablanca medina loop from the public OSRM API. Falls back to a pre-computed route if offline.

---

### 2. Google Maps

Requires a Google Maps API Key and Google Play Services on your device/emulator.

**Setup:**

1. Create an API key at the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis).
2. Enable the **Maps SDK for Android** and **Maps SDK for iOS**.
3. Add to your `.env.local`:
   ```bash
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
   ```
4. Start Expo Go:
   ```bash
   npx expo start
   ```

> [!NOTE]
> If the map appears blank, your emulator may not have Google Play Services. Use a **Google Play Store** system image when creating the emulator in Android Studio.

---

### 3. Mapbox (Development Build Required)

Uses `@rnmapbox/maps`, which is a **native module** not included in standard Expo Go.

**Setup:**

1. Get your tokens from [Mapbox Dashboard](https://account.mapbox.com/):
   - **Public token** (starts with `pk.`) — for tile rendering at runtime.
   - **Secret token** (starts with `sk.`) — for downloading the SDK during build.

2. Add to your `.env.local`:
   ```bash
   EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_token
   RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.your_secret_token
   ```

3. Ensure `app.json` contains the plugin:
   ```json
   "plugins": [
     ["@rnmapbox/maps", { "RNMapboxMapsVersion": "11.0.0" }]
   ]
   ```

4. Build and run:
   ```bash
   npx expo prebuild
   npx expo run:android
   # or
   npx expo run:ios
   ```

---

### 4. MapLibre (Development Build Required)

Uses `@maplibre/maplibre-react-native` with a **Valhalla** directions backend (fully open-source, zero API keys).

**Setup:**

1. Build the development client:
   ```bash
   npx expo prebuild
   npx expo run:android
   ```

2. (Optional) Self-host Valhalla for production:
   ```bash
   docker run -p 8002:8002 ghcr.io/valhalla/valhalla:latest
   ```
   Then set in `.env.local`:
   ```bash
   EXPO_PUBLIC_VALHALLA_URL=http://your-server:8002
   ```
   Without this variable, the example defaults to `https://valhalla1.openstreetmap.de` (free, rate-limited public instance).

---

## 🔧 Metro Configuration

The monorepo root contains a `metro.config.js` that redirects `@ingissa/navcore-*` imports directly to their TypeScript source files. This means:

- **No build step required** for the SDK packages during development.
- Changes to SDK source code are reflected immediately.
- All TypeScript type-checking works correctly in your IDE.

```js
// metro.config.js (simplified)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@ingissa/navcore-')) {
    // Points directly to src/index.ts of each internal package
    return { filePath: path.resolve(projectRoot, `packages/navcore-sdk/packages/${internalPath}/src/index.ts`), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};
```

---

## 🏗️ Architecture

```
useSimulator ────→ position (SimPosition)
                         │
                         ▼
                   useNavCore
                         │
                    NavCoreState
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
         ETAEngine  VoiceTrigger  Map Component
         (offline)   Engine      (Leaflet / Google
                    (proximity)  / Mapbox / MapLibre)
```

### Data Flow

1. **`useSimulator`** generates synthetic GPS positions along the route geometry.
2. **`useNavCore`** consumes raw GPS, applies a Kalman filter, snaps to the route, tracks progress, and emits instruction/arrival events.
3. **`ETAEngine`** maintains a rolling-window speed average to compute live ETA.
4. **`VoiceTriggerEngine`** monitors distance to the next instruction and returns `VoiceCue` objects when the vehicle enters the trigger window.
5. The **map component** receives the route GeoJSON and the snapped position to render the vehicle dot.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| `Unable to resolve @ingissa/navcore-*` | Ensure `metro.config.js` is present at the monorepo root. Run `npx expo start --clear`. |
| `@rnmapbox/maps native is not linked` | Switch to the Leaflet variant for Expo Go, or run `npx expo run:android` for a Dev Build. |
| Google Maps shows blank | Check that your Google Maps API key is set in `.env.local` and your emulator has Google Play Services. |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | Wipe emulator data in Android Studio Device Manager. |
| Voice cues not appearing | Start navigation first (press **▶ START**), then wait until the simulator advances near a waypoint. |
| Mapbox `RNMapboxMapsDownloadToken is deprecated` | Use the `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` environment variable instead of putting the token in `app.json`. |

---

## 📦 Environment Variables Summary

Create a `.env.local` file in the monorepo root:

```bash
# Required for Mapbox examples
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.xxxxx

# Required during Mapbox prebuild (secret token, never commit this)
RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.xxxxx

# Required for Google Maps example
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...

# Optional: Self-hosted Valhalla for MapLibre example
EXPO_PUBLIC_VALHALLA_URL=http://localhost:8002
```

> [!CAUTION]
> Never commit your Mapbox **secret token** (`sk.*`) to version control. Add `.env.local` to your `.gitignore`.
