import * as maplibregl from 'maplibre-gl';
import { NavCore, OSRMDirectionsProvider, ETAEngine, VoiceTriggerEngine } from '@ingissa/navcore-core';
import { MapLibreAdapter } from '@ingissa/navcore-maplibre';
import { PARIS_MOCK_ROUTE, MOCK_FALLBACK_MESSAGE } from '../shared/mock-data';

const ROUTE_WAYPOINTS: [number, number][] = [
  [2.3522, 48.8566],
  [2.3009, 48.8741],
];

// Initialize Map
// @ts-ignore
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: ROUTE_WAYPOINTS[0],
  zoom: 14,
  pitch: 45,
});

const adapter = new MapLibreAdapter(map);
const DEV_BYPASS_KEY = 'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';
const engine = new NavCore({ licenseKey: DEV_BYPASS_KEY });
const eta = new ETAEngine();
const voice = new VoiceTriggerEngine({ earlyTriggerMeters: 100 });

const provider = new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' });

async function init() {
  let route;
  try {
    console.log('Fetching route from OSRM...');
    route = await provider.getRoute(ROUTE_WAYPOINTS);
  } catch (e) {
    console.warn(MOCK_FALLBACK_MESSAGE);
    route = PARIS_MOCK_ROUTE;
  }

  map.on('load', () => {
    // 1. Draw the route line
    adapter.drawRoute(route.geometry, { color: '#6366f1', width: 6 });
    
    // 2. Load route into engine
    engine.setRoute(route.geometry);
    engine.startNavigation();
    
    // 3. Sync voice instructions
    voice.setInstructions([...engine.getInstructions()]);
    
    document.getElementById('status')!.textContent = 'Navigating';
    console.log('NavCore initialized successfully');
  });

  // Listen for instructions
  engine.on('instruction', (instr: any) => {
    const el = document.getElementById('instruction')!;
    el.textContent = instr.text;
    el.style.display = 'block';
    console.log('🗣  ' + instr.text);
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  });

  engine.on('arrival', () => {
    document.getElementById('status')!.textContent = '🏁 Arrived!';
    document.getElementById('status')!.style.color = '#10b981';
  });
}

// Handle GPS/Manual position updates
function updateState(coord: [number, number], accuracy: number, bearing: number | null, speed: number) {
  const state = engine.update({
    coord,
    accuracy,
    bearing,
    speed,
    timestamp: Date.now(),
  });

  if (state.snappedCoord) {
    adapter.updateVehicle(state.snappedCoord, state.bearing, state);
    adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 16, pitch: 50 });
  }

  const etaResult = eta.update(state);
  
  // Update HUD
  document.getElementById('speed')!.textContent = (state.currentSpeed * 3.6).toFixed(0) + ' km/h';
  document.getElementById('dist')!.textContent = state.distanceToDestination
    ? (state.distanceToDestination / 1000).toFixed(1) + ' km'
    : '-';
  document.getElementById('eta')!.textContent = etaResult.isReliable
    ? Math.ceil(etaResult.etaSeconds / 60) + ' min'
    : 'Calculating...';
}

// WebContainer Simulation / Manual Clicking
map.on('click', (e) => {
  console.log('Manual position update:', [e.lngLat.lng, e.lngLat.lat]);
  updateState([e.lngLat.lng, e.lngLat.lat], 5, null, 8.33);
});

// Start Real GPS tracking if available
navigator.geolocation.watchPosition(({ coords }) => {
  updateState(
    [coords.longitude, coords.latitude],
    coords.accuracy,
    coords.heading,
    coords.speed ?? 0
  );
}, (err) => console.warn('Geolocation error:', err.message), { 
  enableHighAccuracy: true 
});

init().catch(console.error);
