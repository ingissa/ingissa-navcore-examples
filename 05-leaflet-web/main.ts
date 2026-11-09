import * as L from 'leaflet';
(window as any).L = L;
import { NavCore, OSRMDirectionsProvider, ETAEngine, getBearingBetweenPoints } from '@ingissa/navcore-core';
import { PARIS_MOCK_ROUTE, MOCK_FALLBACK_MESSAGE } from '../shared/mock-data';

// ---------------------------------------------------------------------------
// NOTE: This example uses the raw Leaflet API to render the route and
// vehicle marker.  The NavCore SDK provides map-adapter packages for
// MapLibre, Leaflet, and Google Maps that wrap this boilerplate — those
// packages are licensed separately.  See https://navcore-web.vercel.app/pricing
// ---------------------------------------------------------------------------

// Global error tracking
window.onerror = (msg, url, line, col, error) => {
  console.error('GLOBAL ERROR:', msg, 'at', line, ':', col, error);
  return false;
};

// ---------------------------------------------------------------------------
// Map initialisation
// ---------------------------------------------------------------------------
const map = L.map('map').setView([48.8566, 2.3522], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  className: 'map-tiles',
}).addTo(map);

// Raw GPS marker (ghost – unsnapped position)
const rawMarker = L.circleMarker([0, 0] as L.LatLngExpression, {
  radius: 5,
  color: '#fff',
  weight: 2,
  fillOpacity: 0.5,
  fillColor: '#fff',
}).addTo(map);

// Vehicle marker (snapped / smoothed position)
const vehicleIcon = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#8b5cf6;border:2px solid white;box-shadow:0 0 12px #8b5cf6;"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
const vehicleMarker = L.marker([48.8566, 2.3522], { icon: vehicleIcon }).addTo(map);

// Route polyline (drawn after route is loaded)
let routeLine: L.Polyline | null = null;

// ---------------------------------------------------------------------------
// Helpers – raw map drawing (replaces LeafletAdapter)
// ---------------------------------------------------------------------------
function drawRoute(geometry: [number, number][], color = '#8b5cf6', weight = 6) {
  // Leaflet uses [lat, lng] order; NavCore geometry is [lng, lat]
  const latLngs = geometry.map(([lng, lat]) => [lat, lng] as L.LatLngExpression);
  if (routeLine) {
    routeLine.setLatLngs(latLngs);
  } else {
    routeLine = L.polyline(latLngs, { color, weight }).addTo(map);
  }
}

function updateVehicle(coord: [number, number], _bearing: number) {
  // Leaflet uses [lat, lng]; NavCore coord is [lng, lat]
  vehicleMarker.setLatLng([coord[1], coord[0]]);
}

function panCamera(coord: [number, number], _bearing: number) {
  map.setView([coord[1], coord[0]], map.getZoom(), { animate: true });
}

// ---------------------------------------------------------------------------
// NavCore engine setup
// ---------------------------------------------------------------------------
const DEV_BYPASS_KEY = 'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';

const engine = new NavCore({
  licenseKey: DEV_BYPASS_KEY,
  baseCorridorMeters: 50,
});
const eta = new ETAEngine({ speedWindowSize: 1 });
const provider = new OSRMDirectionsProvider({ baseUrl: 'https://router.project-osrm.org' });

let simInterval: ReturnType<typeof setInterval> | null = null;
let currentRoute: [number, number][] = [];

const WAYPOINTS: [number, number][] = [[2.3522, 48.8566], [2.3009, 48.8741]];

// ---------------------------------------------------------------------------
// Initialisation – fetch route then start navigation
// ---------------------------------------------------------------------------
async function init() {
  let route: any;
  try {
    console.log('Fetching route from OSRM...');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
    route = await Promise.race([provider.getRoute(WAYPOINTS), timeout]);
    console.log('Route fetched from OSRM!');
  } catch (e: any) {
    console.warn(MOCK_FALLBACK_MESSAGE, e);
    route = PARIS_MOCK_ROUTE;
  }

  console.log('Route loaded. Geometry points:', route.geometry.length);
  console.log('First point:', route.geometry[0]);

  drawRoute(route.geometry, '#8b5cf6', 6);
  engine.setRoute(route.geometry);
  engine.startNavigation();
  currentRoute = route.geometry;

  document.getElementById('status')!.textContent = 'Navigating';
  document.getElementById('status')!.style.color = '#a78bfa';
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
    rawMarker.setLatLng([state.rawGpsCoord[1], state.rawGpsCoord[0]]);
  }

  const displayCoord = isSnapEnabled
    ? state.snappedCoord
    : (isSmoothEnabled ? state.rawGpsCoord : coord);
  const displayBearing = isSnapEnabled ? state.bearing : (bearing || 0);

  if (displayCoord) {
    updateVehicle(displayCoord as [number, number], displayBearing);
    panCamera(displayCoord as [number, number], displayBearing);

    // Course-up: rotate the map element so the vehicle always faces up
    const mapEl = document.getElementById('map')!;
    mapEl.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    mapEl.style.transform = `rotate(${-displayBearing}deg)`;
  }

  const etaResult = eta.update(state);
  const distM = etaResult.distanceRemainingM || state.distanceToDestination || 0;
  document.getElementById('dist')!.textContent = `${(distM / 1000).toFixed(1)} km`;
  document.getElementById('speed')!.textContent = `${Math.round(speed * 3.6)} km/h`;

  const minutes = etaResult.isReliable
    ? Math.ceil(etaResult.etaSeconds / 60)
    : Math.ceil((distM / Math.max(speed, 1)) / 60);

  document.getElementById('eta')!.textContent = `${minutes} min`;

  if (state.hasArrived) {
    document.getElementById('status')!.textContent = '✅ Arrived!';
    document.getElementById('status')!.style.color = '#10b981';
  }
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
  document.getElementById('status')!.style.color = '#a78bfa';
}

document.getElementById('start-sim')!.addEventListener('click', startSimulation);
document.getElementById('stop-sim')!.addEventListener('click', stopSimulation);

// HUD toggle
document.getElementById('hud-toggle')!.addEventListener('click', () => {
  document.getElementById('hud')!.classList.toggle('collapsed');
});

// Manual click → position update
map.on('click', (e: any) => {
  updateState([e.latlng.lng, e.latlng.lat], 5, null, 8.33);
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
  (err) => console.warn(err),
  { enableHighAccuracy: true },
);

init().catch(console.error);
