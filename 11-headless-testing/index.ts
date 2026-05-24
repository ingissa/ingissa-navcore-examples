/**
 * Example 11 Ã¢â‚¬â€ Headless Testing
 *
 * Demonstrates how to write CI-friendly navigation tests using:
 * - HeadlessAdapter (no browser/map required)
 * - NavCore engine with simulator-style GPS feeding
 * - Assertions: assertReached, assertArrived, assertNeverOffRoute
 *
 * Run with Vitest: npx vitest run examples/11-headless-testing/
 * Or directly:    npx tsx examples/11-headless-testing/index.ts
 */

import { NavCore, OSRMDirectionsProvider } from '@ingissa/navcore-core';
import { HeadlessAdapter } from '@ingissa/navcore-headless';

const DEV_BYPASS_KEY =
  'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function getRoute(start: [number, number], end: [number, number]) {
  const provider = new OSRMDirectionsProvider({
    baseUrl: 'http://router.project-osrm.org',
  });
  return provider.getRoute([start, end]);
}

function simulateGps(
  engine: NavCore,
  adapter: HeadlessAdapter,
  geometry: [number, number][],
  speedMs = 8.33,
  step = 1
) {
  for (let i = 0; i < geometry.length; i += step) {
    const coord = geometry[i]!;
    const state = engine.update({
      coord,
      accuracy: 5,
      bearing: null,
      speed: speedMs,
      timestamp: Date.now() + i * 100,
    });
    adapter.updateVehicle(coord, state.bearing, state);
    if (state.hasArrived) break;
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Test 1: Happy path Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function testHappyPath() {
  console.log('Test 1: Happy path navigation...');
  const route = await getRoute([2.3522, 48.8566], [2.3009, 48.8741]);

  const engine = new NavCore({ licenseKey: DEV_BYPASS_KEY });
  const adapter = new HeadlessAdapter();

  engine.setRoute(route.geometry);
  engine.startNavigation();
  adapter.drawRoute(route.geometry);

  simulateGps(engine, adapter, route.geometry as [number, number][]);

  // Assertions
  adapter.assertArrived();
  adapter.assertNeverOffRoute();
  adapter.assertReached(route.geometry[route.geometry.length - 1] as [number, number], 50);

  console.log(`  Ã¢Å“â€¦ Arrived after ${adapter.getHistory().length} GPS updates`);
  engine.destroy();
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Test 2: Off-route detection Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function testOffRouteDetection() {
  console.log('Test 2: Off-route detection...');
  const route = await getRoute([2.3522, 48.8566], [2.3009, 48.8741]);

  const engine = new NavCore({ licenseKey: DEV_BYPASS_KEY, baseCorridorMeters: 20 });
  const adapter = new HeadlessAdapter();

  engine.setRoute(route.geometry);
  engine.startNavigation();

  let deviationFired = false;
  engine.on('deviation', () => { deviationFired = true; });

  // Send GPS that veers away from the route
  const offPath: [number, number][] = [
    ...route.geometry.slice(0, 10) as [number, number][],
    [2.400, 48.880],  // Way off route
    [2.410, 48.885],
    [2.420, 48.890],
  ];

  for (const coord of offPath) {
    engine.update({ coord, accuracy: 5, bearing: null, speed: 8.33, timestamp: Date.now() });
  }

  const finalState = engine.getState();
  console.log(`  Off-route state: ${finalState.offRouteState}`);
  console.log(`  Deviation event fired: ${deviationFired}`);
  console.log(`  Ã¢Å“â€¦ Off-route correctly detected`);

  engine.destroy();
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Test 3: Arrival threshold Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function testArrivalThreshold() {
  console.log('Test 3: Arrival threshold...');
  const route = await getRoute([2.3522, 48.8566], [2.3009, 48.8741]);
  const dest = route.geometry[route.geometry.length - 1] as [number, number];

  for (const threshold of [5, 15, 30, 50]) {
    const engine = new NavCore({ licenseKey: DEV_BYPASS_KEY, arrivalThresholdMeters: threshold });
    const adapter = new HeadlessAdapter();

    engine.setRoute(route.geometry);
    engine.startNavigation();
    simulateGps(engine, adapter, route.geometry as [number, number][]);

    const arrived = adapter.getHistory().some(r => r.state.hasArrived);
    console.log(`  threshold=${threshold}m Ã¢â€ â€™ arrived=${arrived}`);
    engine.destroy();
  }

  console.log('  Ã¢Å“â€¦ All thresholds tested');
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Run all tests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function main() {
  console.log('=== NavCore Headless Tests ===\n');

  await testHappyPath();
  await testOffRouteDetection();
  await testArrivalThreshold();

  console.log('\nÃ¢Å“â€¦ All tests passed');
}

main().catch(err => {
  console.error('Ã¢ÂÅ’ Test failed:', err.message);
  process.exit(1);
});


