# Map Rendering & Adapters Guide

NavCore's engine produces an immutable `NavCoreState` snapshot on every tick. The SDK uses a Bring-Your-Own-Renderer (BYOR) model: applications map vehicle coordinates, bearings, and route lines directly to their preferred UI map component.

---

## The `MapRendererAdapter` Interface

For structured integrations, `@ingissa/navcore-core` exports the `MapRendererAdapter` interface:

```typescript
import type { Coordinate, NavCoreState, RouteStyle, VehicleStyle, CameraOptions } from '@ingissa/navcore-core';

export interface MapRendererAdapter {
  updateVehicle(coord: Coordinate, bearing: number, state: NavCoreState, style?: VehicleStyle): void;
  drawRoute(coords: Coordinate[], style?: RouteStyle): void;
  clearRoute(): void;
  panCamera(coord: Coordinate, bearing: number, options?: CameraOptions): void;
  destroy(): void;
}
```

---

## V2 Ecosystem Rendering Status

> [!NOTE]
> All adapter packages (`@ingissa/navcore-maplibre`, `@ingissa/navcore-leaflet`, `@ingissa/navcore-google-maps`, and `@ingissa/navcore-headless`) are published in v2.x. In React Native or custom UIs, you can also render directly in userland by consuming state from `nav.update()` or `useNavSelector()`.

---

## Direct Rendering Examples

### React Native Maps (`react-native-maps`)

```tsx
import React, { useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useNavSelector } from '@ingissa/navcore-react-native';

export function NavigationMap({ routeGeometry }) {
  const snappedCoord = useNavSelector((s) => s.snappedCoord);
  const bearing = useNavSelector((s) => s.bearing);

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: routeGeometry[0][1],
        longitude: routeGeometry[0][0],
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      <Polyline
        coordinates={routeGeometry.map(([longitude, latitude]) => ({ latitude, longitude }))}
        strokeColor="#3b82f6"
        strokeWidth={5}
      />
      {snappedCoord && (
        <Marker
          coordinate={{ latitude: snappedCoord[1], longitude: snappedCoord[0] }}
          rotation={bearing}
          flat
          anchor={{ x: 0.5, y: 0.5 }}
        />
      )}
    </MapView>
  );
}
```

---

### Web Browser with MapLibre GL JS

```typescript
import maplibregl from 'maplibre-gl';
import type { RoutePlan, NavCoreState } from '@ingissa/navcore-core';

export class WebMapLibreRenderer {
  private map: maplibregl.Map;
  private marker: maplibregl.Marker;

  constructor(containerId: string, styleUrl: string) {
    this.map = new maplibregl.Map({
      container: containerId,
      style: styleUrl,
      center: [2.35, 48.86],
      zoom: 14,
    });

    const el = document.createElement('div');
    el.className = 'navcore-vehicle-marker';
    el.innerHTML = '🚗';
    this.marker = new maplibregl.Marker({ element: el }).setLngLat([2.35, 48.86]).addTo(this.map);
  }

  drawRoute(plan: RoutePlan) {
    this.map.on('load', () => {
      this.map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: plan.geometry as number[][],
          },
        },
      });

      this.map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 5 },
      });
    });
  }

  update(state: NavCoreState) {
    if (!state.snappedCoord) return;
    this.marker.setLngLat([state.snappedCoord[0], state.snappedCoord[1]]);
    this.map.easeTo({
      center: [state.snappedCoord[0], state.snappedCoord[1]],
      bearing: state.bearing,
      duration: 500,
    });
  }

  destroy() {
    this.marker.remove();
    this.map.remove();
  }
}
```