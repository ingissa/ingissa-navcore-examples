# NavCore SDK — Examples

All examples are standalone TypeScript files. Run with `npx tsx`.

## Prerequisites

```bash
cd packages/navcore-sdk
npm install
```

## Running Examples

```bash
# Basic navigation (OSRM + console)
npx tsx examples/01-basic-navigation/index.ts

# Custom route builder
npx tsx examples/02-custom-route-builder/index.ts

# Instruction editor (exam annotations)
npx tsx examples/03-instruction-editor/index.ts

# Directions provider comparison
npx tsx examples/06-directions-providers/index.ts

# Voice triggers
npx tsx examples/07-voice-triggers/index.ts

# ETA engine
npx tsx examples/08-eta-engine/index.ts

# Geofencing
npx tsx examples/09-geofencing/index.ts

# Parallel road resolver + U-turn detection
npx tsx examples/10-parallel-road-resolver/index.ts

# Headless testing
npx tsx examples/11-headless-testing/index.ts
```

## Browser Examples (04, 05)

Examples `04-maplibre-web` and `05-leaflet-web` generate HTML files:

```bash
# Generate HTML
npx tsx examples/04-maplibre-web/index.ts > public/maplibre.html
npx tsx examples/05-leaflet-web/index.ts  > public/leaflet.html

# Serve (requires your app to bundle @ingissa/navcore-core and the adapter)
```

## Example Overview

| # | Name | Feature | Network? |
|---|---|---|---|
| 01 | Basic Navigation | NavCore + OSRM | ✅ OSRM |
| 02 | Custom Route Builder | CustomRouteBuilder, GPX, GeoJSON | ✅ OSRM |
| 03 | Instruction Editor | InstructionEditor, exam points | ✅ OSRM |
| 04 | MapLibre Web | MapLibreAdapter, camera follow | ✅ OSRM |
| 05 | Leaflet Web | LeafletAdapter, OSM tiles | ✅ OSRM |
| 06 | Directions Providers | OSRM, Valhalla, ORS comparison | ✅ All three |
| 07 | Voice Triggers | VoiceTriggerEngine, priorities | ✅ OSRM |
| 08 | ETA Engine | ETAEngine, rolling average | ✅ OSRM |
| 09 | Geofencing | GeofencingEngine, circles/polygons | ❌ None |
| 10 | Parallel Road Resolver | ParallelRoadResolver, U-turns | ❌ None |
| 11 | Headless Testing | HeadlessAdapter, assertions | ✅ OSRM |

> Examples 09 and 10 run entirely offline — no network required.
