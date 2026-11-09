/**
 * Example 01 â€” Basic Navigation
 *
 * Demonstrates the recommended integration path:
 * - createNavigationSession with an OSRM provider
 * - origin/destination routing
 * - typed events and GPS updates
 *
 * Run: npx tsx examples/01-basic-navigation/index.ts
 */

import { createNavigationSession, OSRMDirectionsProvider } from '@ingissa/navcore-core';

async function main() {
  // â”€â”€ 1. Create a session with a routing provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const provider = new OSRMDirectionsProvider({
    baseUrl: 'http://router.project-osrm.org',
    profile: 'driving',
  });

  const nav = createNavigationSession({
    provider,
    providerName: 'osrm',
    engineOptions: { isDev: true, arrivalThresholdMeters: 20 },
  });

  // â”€â”€ 2. Listen to typed events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  nav.subscribe('routeLoaded', (plan) => {
    console.log(`âœ“ Route loaded (${plan.geometry.length} points)`);
  });

  nav.subscribe('instruction', (instr) => {
    console.log(`ðŸ—£  Instruction: ${instr.text ?? instr.instruction}`);
  });

  nav.subscribe('arrival', () => {
    console.log('ðŸ Arrived!');
  });

  nav.subscribe('deviation', ({ anchorIndex }) => {
    console.log(`âš ï¸  Off-route at segment ${anchorIndex}`);
  });

  // â”€â”€ 3. Navigate by origin and destination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const plan = await nav.navigate({
    origin: [2.3522, 48.8566],
    destination: [2.3009, 48.8741],
  });
  console.log(`Route: ${plan.geometry.length} points, ${(plan.distanceM / 1000).toFixed(1)}km, ${Math.round(plan.durationS / 60)}min`);

  // â”€â”€ 4. Simulate GPS updates along the route â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nSimulating navigation...\n');

  for (let i = 0; i < plan.geometry.length; i += 5) {
    const coord = plan.geometry[i]!;
    const next = plan.geometry[Math.min(i + 1, plan.geometry.length - 1)]!;

    // Compute rough bearing
    const dLng = next[0] - coord[0];
    const dLat = next[1] - coord[1];
    const bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;

    const state = nav.update({
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

  nav.destroy();
  console.log('\nDone.');
}

main().catch(console.error);
