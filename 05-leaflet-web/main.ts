import * as L from 'leaflet';
(window as any).L = L;
import { NavCore, OSRMDirectionsProvider, ETAEngine, getBearingBetweenPoints } from '@ingissa/navcore-core';
import { LeafletAdapter } from '@ingissa/navcore-leaflet';
import { PARIS_MOCK_ROUTE, MOCK_FALLBACK_MESSAGE } from '../shared/mock-data';

// Global error tracking
window.onerror = (msg, url, line, col, error) => {
  console.error('GLOBAL ERROR:', msg, 'at', line, ':', col, error);
  return false;
};

// Initialize Map
const map = L.map('map').setView([48.8566, 2.3522], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  className: 'map-tiles' // You can use CSS filters for dark mode
}).addTo(map);

const adapter = new LeafletAdapter(map);
const rawMarker = L.circleMarker([0, 0], { 
  radius: 5, color: '#fff', weight: 2, fillOpacity: 0.5, fillColor: '#fff' 
}).addTo(map);
const DEV_BYPASS_KEY = 'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';
const engine = new NavCore({ 
  licenseKey: DEV_BYPASS_KEY,
  baseCorridorMeters: 50 // Balanced for production
});
const eta = new ETAEngine({ speedWindowSize: 1 });
const provider = new OSRMDirectionsProvider({ baseUrl: 'https://router.project-osrm.org' });

// Setup Simulation State
let simInterval: any = null;
let currentRoute: [number, number][] = [];

const WAYPOINTS: [number, number][] = [[2.3522, 48.8566], [2.3009, 48.8741]];

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

  adapter.drawRoute(route.geometry, { color: '#8b5cf6', width: 6 });
  engine.setRoute(route.geometry);
  engine.startNavigation();
  currentRoute = route.geometry;
  
  document.getElementById('status')!.textContent = 'Navigating';
  document.getElementById('status')!.style.color = '#a78bfa';
}

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

  const displayCoord = isSnapEnabled ? state.snappedCoord : (isSmoothEnabled ? state.rawGpsCoord : coord);
  const displayBearing = isSnapEnabled ? state.bearing : (bearing || 0);

  if (displayCoord) {
    adapter.updateVehicle(displayCoord, displayBearing, state);
    adapter.panCamera(displayCoord, displayBearing, { zoom: 16 });
    
    // Offset camera so vehicle is at the bottom (Standard Nav Layout)
    map.panBy([0, -180], { animate: false });

    // COURSE-UP ENHANCEMENT: Rotate map so vehicle heads Top
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
    document.getElementById('status')!.textContent = '🏁 Arrived!';
    document.getElementById('status')!.style.color = '#10b981';
  }
}

// Manual Click Simulation
map.on('click', (e: any) => {
  updateState([e.latlng.lng, e.latlng.lat], 5, null, 8.33);
});

// Automated Simulation Logic
function startSimulation() {
  if (simInterval || currentRoute.length === 0) return;
  
  let idx = 0;
  simInterval = setInterval(() => {
    if (idx >= currentRoute.length) {
      stopSimulation();
      return;
    }
    
    const current = currentRoute[idx];
    
    // Inject artificial noise (jitter) for demonstration
    const noise = (Math.random() - 0.5) * 0.00015; // Approx 10-15 meters of noise
    const noisyCoord: [number, number] = [current[0] + noise, current[1] + noise];
    
    const next = currentRoute[idx + 1] || current;
    const bearing = getBearingBetweenPoints(current, next);
    
    updateState(noisyCoord, 5, bearing, 13.8); // 50 km/h
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

// Watch Position
navigator.geolocation.watchPosition(({ coords }) => {
  updateState(
    [coords.longitude, coords.latitude],
    coords.accuracy,
    coords.heading,
    coords.speed ?? 0
  );
}, (err) => console.warn(err), { enableHighAccuracy: true });

init().catch(console.error);
