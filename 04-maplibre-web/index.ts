/**
 * Example 04 — MapLibre Web
 *
 * A full browser navigation page using MapLibre GL JS + NavCore.
 * Paste this HTML into a file and open in a browser.
 * Replace 'YOUR_STYLE_URL' with a MapLibre-compatible style.
 *
 * Dependencies (loaded via CDN):
 *   - maplibre-gl
 *   - @navcore/core (bundled via your build tool)
 *   - @navcore/maplibre (bundled via your build tool)
 */

export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NavCore + MapLibre</title>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css" />
  <style>
    body { margin: 0; font-family: system-ui; }
    #map { width: 100vw; height: 100vh; }
    #hud {
      position: fixed; top: 16px; left: 16px;
      background: rgba(0,0,0,0.75); color: white;
      padding: 12px 16px; border-radius: 12px;
      font-size: 13px; min-width: 220px;
      backdrop-filter: blur(8px);
    }
    #hud h3 { margin: 0 0 8px; font-size: 15px; }
    #hud p { margin: 2px 0; }
    #instruction {
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
      background: #7c3aed; color: white;
      padding: 12px 24px; border-radius: 999px;
      font-size: 15px; font-weight: 600;
      box-shadow: 0 4px 24px rgba(124,58,237,0.4);
      display: none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="hud">
    <h3>🧭 NavCore</h3>
    <p>Speed: <span id="speed">—</span></p>
    <p>Distance: <span id="dist">—</span></p>
    <p>ETA: <span id="eta">—</span></p>
    <p>Status: <span id="status">Loading...</span></p>
  </div>
  <div id="instruction"></div>

  <script src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"></script>
  <script type="module">
    // Replace with your actual bundled paths
    import { NavCore, OSRMDirectionsProvider, ETAEngine, VoiceTriggerEngine } from './navcore-core.js';
    import { MapLibreAdapter } from './navcore-maplibre.js';

    const ROUTE_WAYPOINTS = [
      [2.3522, 48.8566],
      [2.3009, 48.8741],
    ];

    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://demotiles.maplibre.org/style.json',
      center: ROUTE_WAYPOINTS[0],
      zoom: 13,
    });

    const adapter = new MapLibreAdapter(map);
    const engine = new NavCore({ isDev: true });
    const eta = new ETAEngine();
    const voice = new VoiceTriggerEngine({ earlyTriggerMeters: 120 });

    const provider = new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' });

    async function init() {
      const route = await provider.getRoute(ROUTE_WAYPOINTS);

      map.on('load', () => {
        adapter.drawRoute(route.geometry, { color: '#7c3aed', width: 5 });
        engine.setRoute(route.geometry);
        engine.startNavigation();
        voice.setInstructions(engine.getInstructions());
        document.getElementById('status').textContent = 'Navigating';
      });

      engine.on('instruction', (instr) => {
        const el = document.getElementById('instruction');
        el.textContent = instr.text;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 4000);
      });

      engine.on('arrival', () => {
        document.getElementById('status').textContent = '🏁 Arrived!';
      });
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
        adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 15, pitch: 40 });
      }

      const etaResult = eta.update(state);
      const cue = voice.update(state);
      if (cue) speechSynthesis.speak(new SpeechSynthesisUtterance(cue.text));

      document.getElementById('speed').textContent = (state.currentSpeed * 3.6).toFixed(0) + ' km/h';
      document.getElementById('dist').textContent = state.distanceToDestination
        ? (state.distanceToDestination / 1000).toFixed(1) + ' km'
        : '—';
      document.getElementById('eta').textContent = etaResult.isReliable
        ? Math.ceil(etaResult.etaSeconds / 60) + ' min'
        : '—';
    }, console.error, { enableHighAccuracy: true });

    init();
  </script>
</body>
</html>`;

// Print the HTML to stdout so you can pipe it to a file:
// npx tsx examples/04-maplibre-web/index.ts > public/index.html
console.log(HTML);
