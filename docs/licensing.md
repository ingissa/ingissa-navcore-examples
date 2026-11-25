# Licensing & Offline Key Verification

> [!NOTE]
> **Plain-Language Summary (License v0.2):**
> This document summarizes the NavCore SDK License Agreement v0.2 and the offline ECDSA P-256 verification implemented in `@ingissa/navcore-core`. **En cas de divergence, le fichier [LICENSE](https://github.com/ingissa/navcore-sdk/blob/main/LICENSE) (et [navcore-web.vercel.app/license](https://navcore-web.vercel.app/license)) prévaut** (see also the courtesy French translation in [LICENSE.fr.md](https://github.com/ingissa/navcore-sdk/blob/main/LICENSE.fr.md)).

---

## License Tiers & Pricing (v0.2)

| Tier | Scope & Rights | Pricing & Updates |
|---|---|---|
| **Core (Free)** | Free to use in **development and production** across unlimited applications. Includes core navigation, map matching, and all adapters including **`@ingissa/navcore-mapbox`**. | **0 USD** (free). |
| **Suite** | Unlocks all **Pro Modules** for **1 Application** (development and production), bound to that application's bundle ID or domain (`applicationId`). | **49 USD** per app, includes **12 months** of updates. Renewal: **25 USD/app/year** (optional; never disables existing keys). |
| **Studio** | Grants Suite rights for up to **10 Applications** (including client applications), each with its own license key. | **349 USD**. |
| **Enterprise** | Custom volume, SLA, source/escrow, or custom terms. | Custom quote. |

- **Pro Modules** gated by a Suite / Studio / Enterprise key:
  - Dead Reckoning (`dead_reckoning`)
  - Compound Deviation Detection (`compound_deviation`)
  - Parallel Road Resolver (`parallel_road_resolution`)
  - `VoiceTriggerEngine` (`voice_triggers`)
  - `ETAEngine` (`eta`)
  - `GeofencingEngine` (`geofencing`)
- **Security Patches**: Free for at least **24 months** after the first release of the major version you hold.
- **Refund & Reissue**: 14-day refund window. One license key reissue included; further reissues are **10 USD**.
- **Acquiring a Commercial License**: [https://navcore-web.vercel.app/pricing](https://navcore-web.vercel.app/pricing)

The `package.json` manifest of each package declares `"license": "SEE LICENSE IN LICENSE"`.

---

## Technical Architecture of the License Key

NavCore implements offline license verification in `@ingissa/navcore-core` (`LicenseManager`).

### 1. Key Anatomy

A NavCore license key is a dot-separated string containing two base64-encoded segments:

$$\text{LicenseKey} = \text{base64(Payload)} \mathbin{\Vert} \text{"."} \mathbin{\Vert} \text{base64(Signature)}$$

### 2. Payload Structure (`LicensePayload`)

Decoding the first segment yields a JSON object:

```typescript
export interface LicensePayload {
  /** Version 2 denotes the Navcore Suite commercial contract. */
  v?: 2;
  /** Opaque server-issued license identifier. */
  lid?: string;
  /** Commercial product identifier. */
  pid?: 'navcore-suite';
  /** Issuance timestamp in milliseconds. */
  iat?: number;
  /** Optional legacy expiration timestamp in milliseconds. */
  exp?: number;
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
- **Embedded Public Key**: The uncompressed SEC1 public key is embedded directly into the SDK binary. In asymmetric cryptography (ECDSA), the public key is designed to be public and is used solely to verify signatures.
- **Runtime Cryptography**: Verification executes via the standard WebCrypto API (`crypto.subtle`) when available. If the host environment does not provide `crypto.subtle` (such as certain React Native runtimes), the SDK falls back to a bundled implementation powered by `@noble/curves`.

### 4. Verification Workflow

When `license.validate(key)` executes:
1. Splits the string on `.`. Returns `'INVALID'` if either part is missing.
2. Decodes and parses the payload JSON.
3. For a V2 Suite key, confirms that its `bid` equals `applicationId` supplied to the SDK.
4. Checks expiration only when an `exp` claim exists. V2 Suite keys omit it deliberately and are perpetual for the licensed version.
5. Cryptographically verifies the signature over the payload bytes using the embedded P-256 public key.
6. Populates the set of enabled feature flags and transitions status to `'VALID'`.

---

## Verified Security Realities & Technical Limits

### 1. Application Binding Requires an Explicit Runtime Value
V2 Suite keys are bound to `applicationId` supplied by the integrator:

```ts
const nav = new NavCore({
  licenseKey: process.env.NAVCORE_LICENSE_KEY,
  applicationId: 'com.example.app',
});
```

The SDK rejects a V2 key when `applicationId` is missing or differs from `bid`. It cannot independently discover a trustworthy package identifier across every JavaScript runtime, so the runtime value remains client-controlled and is an entitlement control rather than hardware DRM.

### 2. Client-Side Keys Are Extractable (`EXPO_PUBLIC_`)
In mobile or single-page web applications, environment variables (such as `EXPO_PUBLIC_NAVCORE_LICENSE_KEY`) are incorporated directly into the compiled JavaScript bundle in plain text.
- **Do not store private backend credentials or secret tokens in the license key or client environment variables.**

### 3. Entitlement Gating vs DRM
The license key mechanism functions as an offline feature entitlement gate, **not as anti-tamper digital rights management (DRM)**. A V2 Suite key is perpetual for the licensed version and does not require recurring server validation; therefore a later server-side revocation cannot immediately affect a fully offline installation.

---

## Feature Flags (`FeatureKey`)

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

During local engineering, testing, and CI runs (`NODE_ENV !== 'production'` and `globalThis.__DEV__ !== false`):
```typescript
const nav = createNavigationSession({
  provider,
  engineOptions: { isDev: true },
});
```
In non-production runtimes, when `isDev === true`, `license.hasFeature()` returns `true` for all features without requiring a key and logs a one-time `console.warn` (`[NavCore] Development mode: Pro modules unlocked for development only. Not licensed for production use.`).

In production builds (`process.env.NODE_ENV === 'production'` or React Native release builds where `globalThis.__DEV__ === false`), `isDev: true` is **ignored**: `license.hasFeature()` remains gated by a valid signed license key, and a one-time `console.error` (`[NavCore] isDev is ignored in production builds. Pro modules require a valid license key.`) is emitted.

---

## Perpetual Suite and key rotation

1. **Keep the private signing key server-side.** The SDK contains only the public verifier.
2. **Use `applicationId`.** It must exactly match the bundle ID or domain submitted at purchase.
3. **Reissue deliberately.** One reissue per license key is free, and each additional reissue is 10 USD.
4. **Plan key rotation.** Add and honour a key identifier before introducing a second public key. Existing offline tokens cannot be retroactively changed.
