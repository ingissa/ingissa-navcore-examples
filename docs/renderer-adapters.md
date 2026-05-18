# Renderer Adapters

NavCore's engine outputs a `NavCoreState` on every tick. Renderer adapters translate that state into map library calls — drawing the route, moving the vehicle marker, and panning the camera.

## The `MapRendererAdapter` Interface

```typescript
interface MapRendererAdapter {
  updateVehicle(coord: Coordinate, bearing: number, state: NavCoreState, style?: VehicleStyle): void;
  drawRoute(coords: Coordinate[], style?: RouteStyle): void;
  clearRoute(): void;
  panCamera(coord: Coordinate, bearing: number, options?: CameraOptions): void;
  destroy(): void;
}
```

---

## `HeadlessAdapter` — Node.js / CI / Testing

No map library required. Records all state for assertions.

```typescript
import { HeadlessAdapter } from '@ingissa/navcore-headless';

const adapter = new HeadlessAdapter();
adapter.drawRoute(route.geometry);

// Feed state on every tick
engine.on('update', (state) => {
  if (state.snappedCoord) adapter.updateVehicle(state.snappedCoord, state.bearing, state);
});

// Run simulation ... then assert
adapter.assertReached([2.347, 48.859], 20);   // within 20m
adapter.assertArrived();
adapter.assertNeverOffRoute();

console.log(`Recorded ${adapter.getHistory().length} positions`);
```

---

## `MapLibreAdapter` — MapLibre GL JS

```bash
npm install maplibre-gl @ingissa/navcore-maplibre
```

```typescript
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapLibreAdapter } from '@ingissa/navcore-maplibre';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [2.35, 48.86],
  zoom: 13,
});

const adapter = new MapLibreAdapter(map, {
  vehicleHtml: '<div class="my-vehicle-icon">🚗</div>',  // optional custom icon
});

map.on('load', () => {
  // Draw route
  adapter.drawRoute(routeGeometry, { color: '#7c3aed', width: 5 });
});

// On every engine tick
engine.on('update', (state) => {
  if (!state.snappedCoord) return;
  adapter.updateVehicle(state.snappedCoord, state.bearing, state);
  adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 15, pitch: 45 });
});

// Cleanup
window.addEventListener('beforeunload', () => adapter.destroy());
```

### Route Style Options

```typescript
interface RouteStyle {
  color?: string;        // CSS color (default: '#7c3aed')
  width?: number;        // pixels (default: 4)
  opacity?: number;      // 0–1 (default: 0.9)
  dashArray?: number[];  // e.g. [8, 4] for dashed line
}
```

---

## `LeafletAdapter` — Leaflet.js

```bash
npm install leaflet @ingissa/navcore-leaflet
# TypeScript: npm install -D @types/leaflet
```

```typescript
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LeafletAdapter } from '@ingissa/navcore-leaflet';

const map = L.map('map').setView([48.86, 2.35], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

const adapter = new LeafletAdapter(map);

adapter.drawRoute(routeGeometry, { color: '#7c3aed', width: 4 });

engine.on('update', (state) => {
  if (!state.snappedCoord) return;
  adapter.updateVehicle(state.snappedCoord, state.bearing, state);
  adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 15 });
});
```

> **Note:** Leaflet does not support map rotation natively. The vehicle marker rotates via CSS transform, but the map background stays north-up. Use MapLibre for full map rotation.

---

## `GoogleMapsAdapter` — Google Maps JS API v3

```html
<!-- In your HTML (replace YOUR_KEY) -->
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY"></script>
```

```typescript
import { GoogleMapsAdapter } from '@ingissa/navcore-google-maps';

const map = new google.maps.Map(document.getElementById('map')!, {
  center: { lat: 48.86, lng: 2.35 },
  zoom: 14,
});

const adapter = new GoogleMapsAdapter(map, { vehicleIconScale: 1.2 });

adapter.drawRoute(routeGeometry, { color: '#7c3aed', width: 4 });

engine.on('update', (state) => {
  if (!state.snappedCoord) return;
  adapter.updateVehicle(state.snappedCoord, state.bearing, state);
  adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 16 });
});
```

> **Note:** Google Maps v3 doesn't natively rotate the map view. For bearing-aware map rotation, use MapLibre or the Maps 3D API.

---

## Writing a Custom Adapter

```typescript
import type { MapRendererAdapter, RouteStyle, VehicleStyle, CameraOptions } from '@ingissa/navcore-core';
import type { Coordinate, NavCoreState } from '@ingissa/navcore-core';

export class MyMapAdapter implements MapRendererAdapter {
  constructor(private readonly myMap: MyMap) {}

  updateVehicle(coord: Coordinate, bearing: number, _state: NavCoreState): void {
    this.myMap.setMarkerPosition(coord[1], coord[0]);
    this.myMap.setMarkerRotation(bearing);
  }

  drawRoute(coords: Coordinate[], style?: RouteStyle): void {
    this.myMap.drawPolyline(coords, style?.color ?? '#7c3aed');
  }

  clearRoute(): void { this.myMap.clearPolyline(); }

  panCamera(coord: Coordinate, bearing: number): void {
    this.myMap.flyTo({ center: coord, bearing });
  }

  destroy(): void { this.myMap.removeAllLayers(); }
}
```
