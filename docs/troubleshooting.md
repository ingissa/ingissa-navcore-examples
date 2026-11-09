# Troubleshooting Guide

This guide covers common integration pitfalls, dependency conflicts, and runtime errors when using NavCore 1.0.9.

---

## 1. Deprecated Versions & Broken Entrypoints

### Symptom
```text
Error: Cannot find module '@ingissa/navcore-react-native'
or
npm error deprecated @ingissa/navcore-react-native@1.0.8: Entrées de paquet cassées ; utiliser 1.0.9.
```

### Cause
Releases `1.0.7` and `1.0.8` of `@ingissa/navcore-react-native` and `@ingissa/navcore-simulator`, as well as `1.0.8` of `@ingissa/navcore-mapbox` and `@ingissa/navcore-types`, were published with incorrect package entrypoint configurations and have been deprecated on npm.

### Solution
Synchronize all NavCore packages in your `package.json` to **`1.0.9`**:

```json
{
  "dependencies": {
    "@ingissa/navcore-core": "1.0.9",
    "@ingissa/navcore-react-native": "1.0.9",
    "@ingissa/navcore-mapbox": "1.0.9",
    "@ingissa/navcore-simulator": "1.0.9",
    "@ingissa/navcore-types": "1.0.9"
  }
}
```

Then reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 2. Peer Dependency Conflicts During `npm install`

### Symptom
```text
npm error ERESOLVE unable to resolve dependency tree
npm error Found: react@18.3.1
npm error Could not resolve dependency: peer react@"18.2.0" from react-native@0.72.x
```

### Cause
npm 7+ enforces strict peer dependency matching. React Native 0.72 pins React 18.2.0, which can conflict with secondary tooling requiring React 18.3+.

### Solution
Install using `--legacy-peer-deps`:
```bash
npm install --legacy-peer-deps
```

Or declare an override in your root `package.json`:
```json
{
  "overrides": {
    "@types/react": "^18.3.1"
  }
}
```

---

## 3. Duplicate Instances of `@ingissa/navcore-core`

### Symptom
Subscribing to events or passing a `RoutePlan` throws unexpected validation errors:
```text
[RoutePlan] Invalid coordinate at geometry index 0
or
Event listeners on engine never trigger when session updates
```

### Cause
In monorepos or un-deduplicated package trees, an adapter (e.g. `@ingissa/navcore-react-native`) and the main application might resolve two separate physical copies of `@ingissa/navcore-core` in `node_modules`.

### Solution
Deduplicate dependencies:
```bash
npm dedupe
```
Ensure your bundler resolves `@ingissa/navcore-core` as a singleton. In Vite (`vite.config.ts`):
```typescript
export default defineConfig({
  resolve: {
    dedupe: ['@ingissa/navcore-core'],
  },
});
```

In React Native (`metro.config.js`):
```javascript
const path = require('path');
module.exports = {
  resolver: {
    extraNodeModules: {
      '@ingissa/navcore-core': path.resolve(__dirname, 'node_modules/@ingissa/navcore-core'),
    },
  },
};
```

---

## 4. License Key Verification Errors

### Diagnosing Status
Check the returned license status:
```typescript
const status = engine.getState().licenseStatus; // 'VALID' | 'INVALID' | 'EXPIRED' | 'MISSING'
```

### Error Scenarios:

1. **`status: 'MISSING'`**:
   - *Cause*: `licenseKey` was omitted while `isDev: false` (production mode).
   - *Fix*: Provide a valid license key or pass `isDev: true` during local development.

2. **`status: 'EXPIRED'`**:
   - *Cause*: The `exp` timestamp in the license payload has elapsed.
   - *Fix*: Obtain an updated license key from your account manager.

3. **`status: 'INVALID'`**:
   - *Cause*: The license key was truncated, modified, or corrupted during transfer, or failed ECDSA P-256 signature verification.
   - *Fix*: Verify the entire dot-separated string `payload.signature` is preserved without linebreaks or URL-encoding artifacts.

---

## 5. Cannot Find Module `@ingissa/navcore-headless` or `-maplibre`

### Symptom
```text
error TS2307: Cannot find module '@ingissa/navcore-headless' or its corresponding type declarations.
```

### Cause
`@ingissa/navcore-headless`, `@ingissa/navcore-maplibre`, `@ingissa/navcore-leaflet`, and `@ingissa/navcore-google-maps` are **private packages** not published in the 1.0.9 release.

### Solution
- For automated testing and CI: Use `@ingissa/navcore-simulator/node`, which operates headlessly in any environment.
- For map rendering: Render vehicle markers and routes directly using your map library's native components (`react-native-maps`, `@rnmapbox/maps`, or MapLibre GL) by reading state from `nav.update()` or `useNavSelector()`.