# Licensing & Offline Key Verification

> [!NOTE]
> **Owner & Legal Notice:**
> The following document accurately describes the offline license verification behavior implemented in `@ingissa/navcore-core`. Statements regarding copyright, rights grants, and compliance expectations must be reviewed by legal counsel before customer distribution.

---

## License Terms

All packages and source code in the NavCore SDK repository are proprietary:

```text
Copyright (c) 2026 Abdelnasser Aitabi. All rights reserved.
No license is granted except by separate written agreement.
```

The `package.json` manifest of each package declares `"license": "SEE LICENSE IN LICENSE"`. No open-source or permissive license (such as MIT) is granted for current releases.

### Acquiring a Commercial License
Commercial subscriptions and production license keys are distributed through:
👉 [https://navcore-web.vercel.app/pricing](https://navcore-web.vercel.app/pricing)

---

## Technical Architecture of the License Key

NavCore implements offline license verification in [`packages/core/src/license/LicenseManager.ts`](file:///E:/WORKSPACE/expo_projects/navcore-sdk/packages/core/src/license/LicenseManager.ts).

### 1. Key Anatomy

A NavCore license key is a dot-separated string containing two base64-encoded segments:

$$\text{LicenseKey} = \text{base64(Payload)} \mathbin{\Vert} \text{"."} \mathbin{\Vert} \text{base64(Signature)}$$

### 2. Payload Structure (`LicensePayload`)

Decoding the first segment yields a JSON object:

```typescript
export interface LicensePayload {
  /** Expiration timestamp in milliseconds since Unix epoch */
  exp: number;
  /** Bundle ID or domain specified during issuance */
  bid: string;
  /** Granular feature entitlement flags */
  f?: string[];
  /** Legacy tier identifier ('core' | 'pro'). 'pro' enables all features */
  t?: 'core' | 'pro';
}
```

### 3. Cryptographic Signature & Verification

- **Algorithm**: ECDSA over NIST curve P-256 (secp256r1) with SHA-256.
- **Embedded Public Key**: The uncompressed SEC1 public key is embedded directly into the SDK binary:
  `BJOqJyZiZFrURbrIkkuvXXHTjV+MS9kp5uAGTvnWI0sp3yYi+Me7axMvNDCJi37ZJwVk/6iNM+6MeEO1TS97Xug=`
  In asymmetric cryptography (ECDSA), the public key is designed to be public and is used solely to verify signatures. Exposing the public key does not weaken the cryptographic scheme: an attacker cannot forge signatures or issue valid license keys without access to the secret private key held securely on the license issuance server.
- **Runtime Cryptography**: Verification executes via the standard WebCrypto API (`crypto.subtle`) when available. If the host environment does not provide `crypto.subtle` (such as certain React Native runtimes), the SDK falls back to a bundled implementation powered by `@noble/curves`.

### 4. Verification Workflow

When `license.validate(key)` executes:
1. Splits the string on `.`. Returns `'INVALID'` if either part is missing.
2. Decodes and parses the payload JSON.
3. Checks expiration: if `Date.now() > payload.exp`, returns `'EXPIRED'`.
4. Cryptographically verifies the signature over the payload bytes using the embedded P-256 public key.
5. Populates the set of enabled feature flags and transitions status to `'VALID'`.

---

## Verified Security Realities & Technical Limits

To maintain technical accuracy and avoid creating unwarranted security or legal expectations, developers and integrators must understand the following technical limits of the offline validation model:

### 1. Bundle ID is Not Enforced at Runtime
While the license payload contains a `bid` field (e.g. `com.example.app`), the `LicenseManager` implementation **does not compare `bid` against the host application's package name or bundle ID at runtime**. Any application holding a validly signed payload will pass verification.

### 2. Client-Side Keys Are Extractable (`EXPO_PUBLIC_`)
In mobile or single-page web applications, environment variables (such as `EXPO_PUBLIC_NAVCORE_LICENSE_KEY`) are incorporated directly into the compiled JavaScript bundle in plain text.
- Any end-user can extract the key by decompressing the `.apk`/`.ipa` or inspecting the web bundle.
- **Do not store private backend credentials or secret tokens in the license key or client environment variables.**

### 3. Entitlement Gating vs DRM
The license key mechanism functions as an offline feature entitlement gate, **not as anti-tamper digital rights management (DRM)**. It verifies whether an authorized customer is operating within their contractual term, but does not prevent client-side reverse engineering or code modification.

---

## Feature Flags (`FeatureKey`)

Features in NavCore are gated by string keys defined in [`packages/core/src/features.ts`](file:///E:/WORKSPACE/expo_projects/navcore-sdk/packages/core/src/features.ts):

| Feature Key | Constant Symbol | Description |
|---|---|---|
| `gps_smoothing` | `FEATURES.GPS_SMOOTHING` | 2D Kalman filter coordinate smoothing |
| `basic_snapping` | `FEATURES.BASIC_SNAPPING` | Nearest segment route snapping |
| `advanced_snapping` | `FEATURES.ADVANCED_SNAPPING` | Route snapping with bearing mismatch penalty |
| `dead_reckoning` | `FEATURES.DEAD_RECKONING` | Inertial extrapolation during GPS signal loss |
| `route_offset` | `FEATURES.ROUTE_OFFSET` | Smooth sub-segment linear offset prediction |
| `progress_tracking` | `FEATURES.PROGRESS_TRACKING` | Monotonic progress tracking & circuit wrapping |
| `advanced_bearing` | `FEATURES.ADVANCED_BEARING` | Lookahead bearing smoothing and speed-adaptive alpha |
| `compound_deviation` | `FEATURES.COMPOUND_DEVIATION` | Multi-signal deviation detection (distance, bearing, movement) |
| `parallel_road_resolution`| `FEATURES.PARALLEL_ROAD_RESOLUTION`| Disambiguation of dual carriageways & slip roads |
| `u_turn_protection` | `FEATURES.U_TURN_PROTECTION` | Bearing penalty when heading opposes route direction |
| `voice_triggers` | `FEATURES.VOICE_TRIGGERS` | Timed instruction cue scheduling for TTS |
| `eta` | `FEATURES.ETA` | Local rolling-average ETA computation |
| `geofencing` | `FEATURES.GEOFENCING` | Circular and polygonal geofence monitoring |
| `nav_ai` | `FEATURES.NAV_AI` | Turn anticipation and oscillation suppression |

When a consumer attempts to invoke a gated feature without an active license, the SDK logs a single console warning:
```text
[NavCore] Feature 'dead_reckoning' requires a Pro license
```

---

## Development Mode (`isDev: true`)

During local engineering, testing, and CI runs:
```typescript
const nav = createNavigationSession({
  provider,
  engineOptions: { isDev: true },
});
```
When `isDev === true`, `license.hasFeature()` unconditionally returns `true` for all features without requiring a key or cryptographic signature check.

---

## Key Rotation Best Practices

1. **Set Realistic Expirations**: Request keys with standard annual expiration dates (`exp`).
2. **Handle Expiration Gracefully**: Monitor `nav.getState().licenseStatus`. When status transitions to `'EXPIRED'`, the engine continues basic snapping but halts Pro feature additions.
3. **Remote Configuration**: Fetch the current license key from your authorized backend API on application startup rather than hardcoding long-lived strings in mobile application binaries.