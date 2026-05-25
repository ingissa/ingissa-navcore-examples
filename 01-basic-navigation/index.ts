/**
 * Example 01 - Basic Navigation
 *
 * Demonstrates the minimal setup to get NavCore running:
 * - OSRMDirectionsProvider (self-hosted, zero cost)
 * - NavCore engine with GPS updates
 * - Console output of state
 *
 * Run: npx tsx 01-basic-navigation/index.ts
 */

import { NavCore, OSRMDirectionsProvider } from '@ingissa/navcore-core';
import { PARIS_MOCK_ROUTE, MOCK_FALLBACK_MESSAGE } from '../shared/mock-data';

async function main() {
  // -- 1. Get route (live OSRM or pre-fetched fallback for StackBlitz) ------
  let route: { geometry: [number, number][]; distance: number; duration: number };

  try {
    const provider = new OSRMDirectionsProvider({
      baseUrl: 'http://router.project-osrm.org',
      profile: 'driving',
    });

    console.log('Fetching route from OSRM...');
    route = await provider.getRoute([
      [2.3522, 48.8566],  // Paris center
      [2.3009, 48.8741],  // Arc de Triomphe
    ]);
  } catch {
    console.log(MOCK_FALLBACK_MESSAGE);
    route = PARIS_MOCK_ROUTE;
  }

  console.log(`Route: ${route.geometry.length} points, ${(route.distance / 1000).toFixed(1)}km, ${Math.round(route.duration / 60)}min`);

  // -- 2. Create the engine --------------------------------------------------
  const DEV_BYPASS_KEY =
    'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';

  const engine = new NavCore({
    licenseKey: DEV_BYPASS_KEY,  // Unlocks all features securely for development
    arrivalThresholdMeters: 20,
  });

  // -- 3. Listen to events ---------------------------------------------------
  engine.on('routeLoaded', ({ routeLength }: any) => {
    console.log(`[OK] Route loaded (${routeLength} points)`);
  });

  engine.on('instruction', (instr: any) => {
    console.log(`    Instruction: ${instr.text ?? instr.instruction}`);
  });

  engine.on('arrival', () => {
    console.log('    Arrived!');
  });

  engine.on('deviation', ({ anchorIndex }: any) => {
    console.log(`[!] Off-route at segment ${anchorIndex}`);
  });

  // -- 4. Load route ---------------------------------------------------------
  engine.setRoute(route.geometry);
  engine.startNavigation();

  // -- 5. Simulate GPS updates along the route -------------------------------
  console.log('\nSimulating navigation...\n');

  for (let i = 0; i < route.geometry.length; i += 5) {
    const coord = route.geometry[i]!;
    const next = route.geometry[Math.min(i + 1, route.geometry.length - 1)]!;

    // Compute rough bearing
    const dLng = next[0] - coord[0];
    const dLat = next[1] - coord[1];
    const bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;

    const state = engine.update({
      coord,
      accuracy: 5,
      bearing,
      speed: 8.33,  // ~30 km/h
      timestamp: Date.now() + i * 100,
    });

    if (i % 20 === 0) {
      const dist = state.distanceToDestination;
      console.log(
        `  [${i}] idx=${state.routeIndex}  ` +
        `dist=${dist !== null ? (dist / 1000).toFixed(2) + 'km' : '-'}  ` +
        `offRoute=${state.isOffRoute}  ` +
        `arrived=${state.hasArrived}`
      );
    }

    if (state.hasArrived) break;
  }

  engine.destroy();
  console.log('\nDone.');
}

main().catch(console.error);
