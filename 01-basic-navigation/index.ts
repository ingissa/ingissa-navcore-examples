/**
 * Example 01 â€” Basic Navigation
 *
 * Demonstrates the minimal setup to get NavCore running:
 * - OSRMDirectionsProvider (self-hosted, zero cost)
 * - NavCore engine with GPS updates
 * - Console output of state
 *
 * Run: npx tsx examples/01-basic-navigation/index.ts
 */

import { NavCore, OSRMDirectionsProvider } from '@ingissa/navcore-core';

async function main() {
  // â”€â”€ 1. Get route from OSRM (public demo server â€” use self-hosted in production) â”€â”€
  const provider = new OSRMDirectionsProvider({
    baseUrl: 'http://router.project-osrm.org',
    profile: 'driving',
  });

  console.log('Fetching route...');
  const route = await provider.getRoute([
    [2.3522, 48.8566],  // Paris center
    [2.3009, 48.8741],  // Arc de Triomphe
  ]);

  console.log(`Route: ${route.geometry.length} points, ${(route.distance / 1000).toFixed(1)}km, ${Math.round(route.duration / 60)}min`);

  // â”€â”€ 2. Create the engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const DEV_BYPASS_KEY =
    'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';

  const engine = new NavCore({
    licenseKey: DEV_BYPASS_KEY,  // Unlocks all features securely for development
    arrivalThresholdMeters: 20,
  });

  // â”€â”€ 3. Listen to events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  engine.on('routeLoaded', ({ routeLength }: any) => {
    console.log(`âœ“ Route loaded (${routeLength} points)`);
  });

  engine.on('instruction', (instr: any) => {
    console.log(`ðŸ—£  Instruction: ${instr.text ?? instr.instruction}`);
  });

  engine.on('arrival', () => {
    console.log('ðŸ Arrived!');
  });

  engine.on('deviation', ({ anchorIndex }: any) => {
    console.log(`âš ï¸  Off-route at segment ${anchorIndex}`);
  });

  // â”€â”€ 4. Load route â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  engine.setRoute(route.geometry);
  engine.startNavigation();

  // â”€â”€ 5. Simulate GPS updates along the route â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    if (i % 50 === 0) {
      const dist = state.distanceToDestination;
      console.log(
        `  [${i}] idx=${state.routeIndex}  ` +
        `dist=${dist !== null ? (dist / 1000).toFixed(2) + 'km' : 'â€”'}  ` +
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


