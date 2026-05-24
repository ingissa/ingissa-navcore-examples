# P3 Features Ã¢â‚¬â€ Value-Add Modules

These modules are pure TypeScript, zero dependencies, and work everywhere NavCore runs.

---

## VoiceTriggerEngine

Converts NavCore state into **when to speak** Ã¢â‚¬â€ you provide the TTS library.

### How it works

```
engine.update(gps) Ã¢â€ â€™ NavCoreState
                          Ã¢â€â€š
                    voice.update(state)
                          Ã¢â€â€š
                    checks: distance to next instruction
                          Ã¢â€â€š
                   in trigger window?  Ã¢â€ â€™ VoiceCue
                   no?               Ã¢â€ â€™ null
```

The trigger window is speed-adaptive: at 80 km/h the window opens earlier (120m+) than at 30 km/h (40m).

### Setup

```typescript
import { NavCore, VoiceTriggerEngine, InstructionEditor } from '@ingissa/navcore-core';

const engine = new NavCore({ isDev: true });
const voice = new VoiceTriggerEngine({
  earlyTriggerMeters: 120,   // Trigger 120m before instruction
  lateTriggerMeters: 10,     // Give up if 10m past
  reannounceMeters: 300,     // Re-announce if still 300m away after first trigger
});

// After setRoute:
engine.setRoute(geometry, instructions);
voice.setInstructions(instructions);

// Poll on every GPS tick
navigator.geolocation.watchPosition(({ coords }) => {
  const state = engine.update({ /* ... */ });
  const cue = voice.update(state);
  if (cue) {
    // Browser TTS
    speechSynthesis.speak(new SpeechSynthesisUtterance(cue.text));

    // Or React Native
    // Speech.speak(cue.text);
  }
});
```

### Priority levels

| Priority | When | Use case |
|---|---|---|
| `low` | Re-announce (far away) | Lower TTS volume or skip |
| `normal` | Standard window (80Ã¢â‚¬â€œ120m) | Normal voice |
| `high` | Close (30Ã¢â‚¬â€œ80m) | Interrupt other audio |
| `urgent` | Very close (<30m) | Override all audio |

### Direct event hook

```typescript
engine.on('instruction', (instr) => {
  const cue = voice.onInstruction(instr, engine.getState());
  speechSynthesis.speak(new SpeechSynthesisUtterance(cue.text));
});
```

---

## ETAEngine

Offline ETA computation using a **rolling speed average**. No API calls.

### Setup

```typescript
import { ETAEngine } from '@ingissa/navcore-core';

const eta = new ETAEngine({ speedWindowSize: 6 });

navigator.geolocation.watchPosition(({ coords }) => {
  const state = engine.update({ /* ... */ });
  const result = eta.update(state);

  if (result.isReliable) {
    console.log(`${Math.ceil(result.etaSeconds / 60)} min remaining`);
    console.log(`${(result.distanceRemainingM / 1000).toFixed(1)} km`);
    console.log(new Date(result.etaMs).toLocaleTimeString());
  }
});
```

### Why `isReliable`?

The ETA is unreliable when:
- Not enough speed samples have been collected yet (first few seconds)
- The vehicle has been stopped the whole time and no route distance is available

When unreliable, show `Ã¢â‚¬â€` or a loading state rather than a misleading value.

### Handling traffic / stops

The engine uses the last **reliable** speed (above 0.5 m/s) when the vehicle stops.
This prevents ETA showing `Ã¢Ë†Å¾` at a red light.

```typescript
const eta = new ETAEngine({
  speedWindowSize: 8,         // Smoother (8 samples)
  minimumSpeedMs: 1.0,        // 1 m/s threshold (~3.6 km/h)
  fallbackSpeedMs: 11.11,     // Assume 40 km/h when no data yet
});
```

---

## GeofencingEngine

Zero-server geofencing using **haversine** (circles) and **ray-casting** (polygons).

### Setup

```typescript
import { GeofencingEngine } from '@ingissa/navcore-core';

const geo = new GeofencingEngine({ dwellThresholdMs: 10_000 });

// Register zones Ã¢â‚¬â€ second argument is the human-readable name
geo.addCircle('school-zone', 'School Zone', [2.3522, 48.8566], 50, { speedLimit: 30 });
geo.addPolygon('exam-area', 'Zone A', [
  [2.340, 48.850], [2.360, 48.850],
  [2.360, 48.870], [2.340, 48.870],
]);

// Poll on every GPS tick
navigator.geolocation.watchPosition(({ coords }) => {
  const coord: [number, number] = [coords.longitude, coords.latitude];
  const events = geo.update(coord);

  for (const evt of events) {
    switch (evt.type) {
      case 'enter':
        console.log(`Entered ${evt.name} (${evt.id})`, evt.meta);
        break;
      case 'exit':
        console.log(`Exited ${evt.name} after ${evt.dwellMs}ms`);
        break;
      case 'dwell':
        console.log(`Dwelling in ${evt.name} for ${evt.dwellMs}ms`);
        break;
    }
  }
});
```

### Dynamic zones

```typescript
// Add zone at runtime (e.g. from API)
const id = geo.addCircle('server-zone-42', 'Server Zone 42', center, 100);

// Remove when no longer needed
geo.remove(id);

// Check synchronously
if (geo.isInside('school-zone', currentCoord)) {
  showSpeedWarning();
}

// List all active zones
console.log(geo.listIds());
```

### Dwell detection

The `dwell` event fires every `dwellThresholdMs` while the vehicle stays inside a zone.
This means it can fire **multiple times** for long stays Ã¢â‚¬â€ useful for timing exam sequences.

```typescript
const geo = new GeofencingEngine({ dwellThresholdMs: 5000 }); // every 5 seconds
```
