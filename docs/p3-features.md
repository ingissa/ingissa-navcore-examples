# Advanced Modules (Pro Features)

These modules are implemented in pure TypeScript and execute in any runtime environment (Node.js, browsers, React Native). Offline license verification utilizes WebCrypto when available, falling back to a bundled P-256 verifier when `crypto.subtle` is absent.

---

## VoiceTriggerEngine

Converts NavCore navigation states into timed voice cue announcements for text-to-speech (TTS) engines.

### How It Works

```
engine.update(gps) → NavCoreState
                          │
                    voice.update(state)
                          │
                    checks: distanceToNextInstruction
                          │
                    within trigger window? → VoiceCue
                    otherwise              → null
```

> [!NOTE]
> **Audio Playback:**
> The SDK does not bundle audio playback or TTS speech engines. `VoiceTriggerEngine` calculates *when* an instruction should be spoken and returns a structured `VoiceCue`. The host application forwards `cue.text` to its speech synthesizer (e.g. `expo-speech` or `window.speechSynthesis`).

### Trigger Windows & Configuration

Default trigger distances are configured via `VoiceTriggerOptions`:

| Option | Default | Description |
|---|---|---|
| `earlyTriggerMeters` | `120` m | Target trigger distance before approaching the instruction point |
| `lateTriggerMeters` | `20` m | Grace distance past the waypoint before cancelling the cue |
| `reannounceMeters` | `300` m | Pre-warning trigger distance for early highway notifications |

### Setup Example

```typescript
import { NavCore, VoiceTriggerEngine, InstructionEditor } from '@ingissa/navcore-core';

const engine = new NavCore({ isDev: true });
const voice = new VoiceTriggerEngine({
  earlyTriggerMeters: 120, // Speak 120m before maneuver
  lateTriggerMeters: 20,   // Suppress if vehicle has passed waypoint by 20m
  reannounceMeters: 300,   // Early advance notification
});

// Load route and instructions
engine.setRoute(geometry, instructions);
voice.setInstructions(instructions);

// Poll on location updates
function onGpsUpdate(gps) {
  const state = engine.update(gps);
  const cue = voice.update(state);

  if (cue) {
    // In React Native: Speech.speak(cue.text);
    // In Browser:
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(cue.text));
  }
}
```

### Priority Levels

Each emitted `VoiceCue` includes a `priority` level:

| Priority | Distance Window | Recommended Action |
|---|---|---|
| `'urgent'` | `< 30` m | High-priority prompt; override other audio |
| `'high'` | `30 – 60` m | Standard prompt |
| `'normal'` | `60 – 120` m | Standard prompt |
| `'low'` | `> 120` m (Re-announcement) | Informational; lower volume or skip if speech channel is busy |

---

## ETAEngine

Computes estimated time of arrival locally on the client using a **rolling speed average** without making remote API requests.

### Setup

```typescript
import { ETAEngine } from '@ingissa/navcore-core';

const eta = new ETAEngine({
  speedWindowSize: 6,      // Average across last 6 speed updates
  minimumSpeedMs: 1.0,     // 1 m/s threshold (~3.6 km/h)
  fallbackSpeedMs: 11.11,  // Fallback speed (~40 km/h) when stopped initially
});

const state = engine.update(gps);
const result = eta.update(state);

if (result.isReliable) {
  console.log(`Remaining: ${Math.ceil(result.etaSeconds / 60)} minutes`);
  console.log(`Distance: ${(result.distanceRemainingM / 1000).toFixed(1)} km`);
  console.log(`Arrival time: ${new Date(result.etaMs).toLocaleTimeString()}`);
}
```

### Handling Red Lights & Stops
When a vehicle stops at an intersection, raw GPS speed drops to 0. `ETAEngine` retains the last known reliable speed to prevent dividing by zero or producing infinite ETAs while waiting.

---

## GeofencingEngine

High-performance client-side geofencing supporting both circular and arbitrary polygonal boundaries:

### Setup

```typescript
import { GeofencingEngine, type Coordinate } from '@ingissa/navcore-core';

const geo = new GeofencingEngine({ dwellThresholdMs: 10000 });

// Register zones
geo.addCircle('depot', 'Central Depot', [2.3522, 48.8566], 100);
geo.addPolygon('restricted-zone', 'Urban Center', [
  [2.340, 48.850],
  [2.360, 48.850],
  [2.360, 48.870],
  [2.340, 48.870],
]);

// Evaluate coordinate on each GPS tick
const events = geo.update(currentCoord);
for (const evt of events) {
  console.log(`Geofence event: ${evt.type} on zone "${evt.name}" (${evt.id})`);
}
```

### Event Types
- `'enter'`: Vehicle has crossed from outside to inside the zone.
- `'exit'`: Vehicle has departed the zone (`dwellMs` reports total elapsed duration inside).
- `'dwell'`: Vehicle remains inside the zone (fires every `dwellThresholdMs`).