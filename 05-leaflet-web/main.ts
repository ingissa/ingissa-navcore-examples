import * as L from 'leaflet';
import { NavCore, OSRMDirectionsProvider, ETAEngine } from '@ingissa/navcore-core';
import { LeafletAdapter } from '@ingissa/navcore-leaflet';
import { PARIS_MOCK_ROUTE, MOCK_FALLBACK_MESSAGE } from '../shared/mock-data';

// Initialize Map
const map = L.map('map').setView([48.8566, 2.3522], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  className: 'map-tiles' // You can use CSS filters for dark mode
}).addTo(map);

const adapter = new LeafletAdapter(map);
const DEV_BYPASS_KEY = 'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';
const engine = new NavCore({ licenseKey: DEV_BYPASS_KEY });
const eta = new ETAEngine();
const provider = new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' });

const WAYPOINTS: [number, number][] = [[2.3522, 48.8566], [2.3009, 48.8741]];

async function init() {
  let route;
  try {
    console.log('Fetching route from OSRM...');
    route = await provider.getRoute(WAYPOINTS);
  } catch (e) {
    console.warn(MOCK_FALLBACK_MESSAGE);
    route = PARIS_MOCK_ROUTE;
  }

  adapter.drawRoute(route.geometry, { color: '#8b5cf6', width: 6 });
  engine.setRoute(route.geometry);
  engine.startNavigation();
  
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

  if (state.snappedCoord) {
    adapter.updateVehicle(state.snappedCoord, state.bearing, state);
    adapter.panCamera(state.snappedCoord, state.bearing, { zoom: 16 });
  }

  const etaResult = eta.update(state);
  
  document.getElementById('speed')!.textContent = (state.currentSpeed * 3.6).toFixed(0) + ' km/h';
  document.getElementById('dist')!.textContent = etaResult.isReliable
    ? (etaResult.distanceRemainingM / 1000).toFixed(1) + ' km (' + Math.ceil(etaResult.etaSeconds / 60) + ' min)'
    : state.distanceToDestination ? (state.distanceToDestination / 1000).toFixed(1) + ' km' : '-';
    
  if (state.hasArrived) {
    document.getElementById('status')!.textContent = '🏁 Arrived!';
    document.getElementById('status')!.style.color = '#10b981';
  }
}

// Manual Click Simulation
map.on('click', (e) => {
  updateState([e.latlng.lng, e.latlng.lat], 5, null, 8.33);
});

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
