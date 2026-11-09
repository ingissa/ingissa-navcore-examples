import maplibregl from 'maplibre-gl';
(window as any).maplibregl = maplibregl;
import { NavCore, OSRMDirectionsProvider, ETAEngine, VoiceTriggerEngine, getBearingBetweenPoints } from '@ingissa/navcore-core';
import { PARIS_MOCK_ROUTE, MOCK_FALLBACK_MESSAGE } from '../shared/mock-data';

// ---------------------------------------------------------------------------
// NOTE: This example uses the raw maplibre-gl API to render the route and
// vehicle marker.  The NavCore SDK provides map-adapter packages for
// MapLibre, Leaflet, and Google Maps that wrap this boilerplate — those
// packages are licensed separately.  See https://navcore-web.vercel.app/pricing
// ---------------------------------------------------------------------------

// Global error tracking
window.onerror = (msg, url, line, col, error) => {
  console.error('GLOBAL ERROR:', msg, 'at', line, ':', col, error);
  return false;
};

const ROUTE_WAYPOINTS: [number, number][] = [
  [2.3522, 48.8566],
  [2.3009, 48.8741],
];

// ---------------------------------------------------------------------------
// Map initialisation
// ---------------------------------------------------------------------------
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: ROUTE_WAYPOINTS[0],
  zoom: 14,
  pitch: 45,
});

// Ghost marker – shows raw (unsnapped) GPS position
const ghostEl = document.createElement('div');
ghostEl.style.width = '10px';
ghostEl.style.height = '10px';
ghostEl.style.borderRadius = '50%';
ghostEl.style.background = 'white';
ghostEl.style.boxShadow = '0 0 10px white';
ghostEl.style.opacity = '0.6';
const ghostMarker = new maplibregl.Marker({ element: ghostEl }).setLngLat([0, 0]).addTo(map);

// Vehicle marker – shows snapped / smoothed position
const vehicleEl = document.createElement('div');
vehicleEl.style.width = '16px';
vehicleEl.style.height = '16px';
vehicleEl.style.borderRadius = '50%';
vehicleEl.style.background = '#6366f1';
vehicleEl.style.boxShadow = '0 0 12px #6366f1';
vehicleEl.style.border = '2px solid white';
const vehicleMarker = new maplibregl.Marker({ element: vehicleEl }).setLngLat(ROUTE_WAYPOINTS[0]).addTo(map);

// ---------------------------------------------------------------------------
// Helpers – raw map drawing (replaces MapLibreAdapter)
// ---------------------------------------------------------------------------
function drawRoute(geometry: [number, number][], color = '#6366f1', width = 6) {
  const sourceId = 'navcore-route';
  const layerId = 'navcore-route-layer';

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: geometry,
    },
    properties: {},
  };

  if (map.getSource(sourceId)) {
    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
  } else {
    map.addSource(sourceId, { type: 'geojson', data: geojson });
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width },
    });
  }
}

function updateVehicle(coord: [number, number], bearing: number) {
  vehicleMarker.setLngLat(coord);
  // Rotate the vehicle element to match bearing
  vehicleEl.style.transform = `rotate(${bearing}deg)`;
}

// ---------------------------------------------------------------------------
// NavCore engine setup
// ---------------------------------------------------------------------------
const DEV_BYPASS_KEY = 'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';

let simInterval: ReturnType<typeof setInterval> | null = null;
let currentRoute: [number, number][] = [];

const engine = new NavCore({
  licenseKey: DEV_BYPASS_KEY,
  baseCorridorMeters: 50,
});
const eta = new ETAEngine({ speedWindowSize: 1 });
const voice = new VoiceTriggerEngine({ earlyTriggerMeters: 100 });

const provider = new OSRMDirectionsProvider({ baseUrl: 'https://router.project-osrm.org' });

// ---------------------------------------------------------------------------
// Initialisation – fetch route then start navigation
// ---------------------------------------------------------------------------
async function init() {
  let route: any;
  try {
    console.log('Fetching route from OSRM...');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
    route = await Promise.race([provider.getRoute(ROUTE_WAYPOINTS), timeout]);
    console.log('Route fetched from OSRM!');
  } catch (e: any) {
    console.warn(MOCK_FALLBACK_MESSAGE, e);
    route = PARIS_MOCK_ROUTE;
  }

  const runAfterInit = () => {
    console.log('Route loaded. Geometry points:', route.geometry.length);
    console.log('First point:', route.geometry[0]);

    drawRoute(route.geometry, '#6366f1', 6);

    engine.setRoute(route.geometry);
    engine.startNavigation();
    currentRoute = route.geometry;

    voice.setInstructions([...engine.getInstructions()]);

    document.getElementById('status')!.textContent = 'Navigating';
    console.log('NavCore initialized successfully');
  };

  if (map.loaded()) {
    runAfterInit();
  } else {
    map.on('load', runAfterInit);
  }

  engine.on('instruction', (instr: any) => {
    const el = document.getElementById('instruction')!;
    el.textContent = instr.text;
    el.style.display = 'block';
    console.log('▶ ' + instr.text);
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  });

  engine.on('arrival', () => {
    document.getElementById('status')!.textContent = '✅ Arrived!';
    document.getElementById('status')!.style.color = '#10b981';
  });
}

// ---------------------------------------------------------------------------
// Position update handler
// ---------------------------------------------------------------------------
function updateState(coord: [number, number], accuracy: number, bearing: number | null, speed: number) {
  const state = engine.update({
    coord,
    accuracy,
    bearing,
    speed,
    timestamp: Date.now(),
  });

  const isSnapEnabled = (document.getElementById('toggle-snap') as HTMLInputElement).checked;
  const isSmoothEnabled = (document.getElementById('toggle-smooth') as HTMLInputElement).checked;

  if (state.rawGpsCoord) {
    ghostMarker.setLngLat(state.rawGpsCoord as [number, number]);
  }

  const displayCoord = isSnapEnabled
    ? state.snappedCoord
    : (isSmoothEnabled ? state.rawGpsCoord : coord);
  const displayBearing = isSnapEnabled ? state.bearing : (bearing || 0);

  if (displayCoord) {
    updateVehicle(displayCoord as [number, number], displayBearing);

    // Keep vehicle near the bottom of the viewport – standard nav layout
    map.easeTo({
      center: displayCoord as [number, number],
      bearing: displayBearing,
      zoom: 16,
      pitch: 50,
      offset: [0, 200],
      duration: 300,
    });
  }

  const etaResult = eta.update(state);
  const distM = etaResult.distanceRemainingM || state.distanceToDestination || 0;
  document.getElementById('dist')!.textContent = `${(distM / 1000).toFixed(1)} km`;
  document.getElementById('speed')!.textContent = `${Math.round(speed * 3.6)} km/h`;

  const minutes = etaResult.isReliable
    ? Math.ceil(etaResult.etaSeconds / 60)
    : Math.ceil((distM / Math.max(speed, 1)) / 60);

  document.getElementById('eta')!.textContent = `${minutes} min`;
}

// ---------------------------------------------------------------------------
// Simulation controls
// ---------------------------------------------------------------------------
function startSimulation() {
  if (simInterval || currentRoute.length === 0) return;

  let idx = 0;
  simInterval = setInterval(() => {
    if (idx >= currentRoute.length) {
      stopSimulation();
      return;
    }

    const current = currentRoute[idx];
    const noise = (Math.random() - 0.5) * 0.00015;
    const noisyCoord: [number, number] = [current[0] + noise, current[1] + noise];

    const next = currentRoute[idx + 1] || current;
    const bearing = getBearingBetweenPoints(current, next);

    updateState(noisyCoord, 5, bearing, 13.8); // ~50 km/h
    idx++;
  }, 500);

  document.getElementById('status')!.textContent = 'Simulating...';
  document.getElementById('status')!.style.color = '#10b981';
}

function stopSimulation() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  document.getElementById('status')!.textContent = 'Navigating (Static)';
  document.getElementById('status')!.style.color = '#60a5fa';
}

document.getElementById('start-sim')!.addEventListener('click', startSimulation);
document.getElementById('stop-sim')!.addEventListener('click', stopSimulation);

// HUD toggle
document.getElementById('hud-toggle')!.addEventListener('click', () => {
  document.getElementById('hud')!.classList.toggle('collapsed');
});

// Manual click → position update
map.on('click', (e: any) => {
  console.log('Manual position update:', [e.lngLat.lng, e.lngLat.lat]);
  updateState([e.lngLat.lng, e.lngLat.lat], 5, null, 8.33);
});

// Real GPS (if device supports it)
navigator.geolocation.watchPosition(
  ({ coords }) => {
    updateState(
      [coords.longitude, coords.latitude],
      coords.accuracy,
      coords.heading,
      coords.speed ?? 0,
    );
  },
  (err) => console.warn('Geolocation error:', err.message),
  { enableHighAccuracy: true },
);

init().catch(console.error);
