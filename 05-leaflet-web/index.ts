/**
 * Example 05 — Leaflet Web
 *
 * Full browser navigation page using Leaflet.js + NavCore.
 * Paste this HTML into index.html and open in a browser.
 * No API key required — uses OSM tiles + OSRM routing.
 */

export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NavCore + Leaflet</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
  <style>
    body { margin: 0; }
    #map { width: 100vw; height: 100vh; }
    #hud {
      position: fixed; top: 12px; left: 12px; z-index: 1000;
      background: rgba(0,0,0,0.8); color: #fff;
      padding: 10px 14px; border-radius: 10px; font: 13px system-ui;
    }
    .navcore-vehicle-marker svg { display: block; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="hud">
    <div>🚗 <b id="speed">0</b> km/h</div>
    <div>📍 <b id="dist">—</b></div>
    <div>🏁 <b id="status">Waiting for GPS...</b></div>
  </div>
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script type="module">
    import { NavCore, OSRMDirectionsProvider, ETAEngine } from './navcore-core.js';
    import { LeafletAdapter } from './navcore-leaflet.js';

    const map = L.map('map').setView([48.86, 2.35], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const adapter = new LeafletAdapter(map);
    const engine = new NavCore({ isDev: true });
    const eta = new ETAEngine();
    const provider = new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' });

    const WAYPOINTS = [[2.3522, 48.8566], [2.3009, 48.8741]];

    async function init() {
      const route = await provider.getRoute(WAYPOINTS);
      adapter.drawRoute(route.geometry, { color: '#7c3aed', width: 5 });
      engine.setRoute(route.geometry);
      engine.startNavigation();
      document.getElementById('status').textContent = 'Navigating';
    }

    navigator.geolocation.watchPosition(({ coords }) => {
      const state = engine.update({
        coord: [coords.longitude, coords.latitude],
        accuracy: coords.accuracy,
        bearing: coords.heading,
        speed: coords.speed ?? 0,
        timestamp: Date.now(),
      });
      if (state.snappedCoord) {
        adapter.updateVehicle(state.snappedCoord, state.bearing, state);
        adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 15 });
      }
      const etaResult = eta.update(state);
      document.getElementById('speed').textContent = (state.currentSpeed * 3.6).toFixed(0);
      document.getElementById('dist').textContent = etaResult.isReliable
        ? (etaResult.distanceRemainingM / 1000).toFixed(1) + ' km · ' + Math.ceil(etaResult.etaSeconds / 60) + ' min'
        : state.distanceToDestination ? (state.distanceToDestination / 1000).toFixed(1) + ' km' : '—';
      if (state.hasArrived) document.getElementById('status').textContent = '🏁 Arrived!';
    }, console.error, { enableHighAccuracy: true });

    init();
  </script>
</body>
</html>`;

console.log(HTML);
