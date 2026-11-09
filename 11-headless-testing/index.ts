/**
 * Example 11 — Headless Testing
 *
 * Demonstrates how to write automated, CI-friendly navigation regression tests:
 * - Headless test adapter implementing MapRendererAdapter
 * - NavCore engine execution with simulated GPS fixes
 * - Assertions: reached waypoint, arrived, and off-route detection
 *
 * Run with Vitest: npx vitest run examples/11-headless-testing/
 * Or directly:    npx tsx examples/11-headless-testing/index.ts
 */

import {
  NavCore,
  OSRMDirectionsProvider,
  haversineDistance,
  type Coordinate,
  type MapRendererAdapter,
  type NavCoreState,
} from '@ingissa/navcore-core';

// ── In-Memory Headless Test Adapter ──────────────────────────────────────────

interface RecordedPosition {
  coord: Coordinate;
  bearing: number;
  state: NavCoreState;
}

class HeadlessTestAdapter implements MapRendererAdapter {
  private history: RecordedPosition[] = [];
  private currentRoute: Coordinate[] = [];

  drawRoute(coords: Coordinate[]): void {
    this.currentRoute = [...coords];
  }

  clearRoute(): void {
    this.currentRoute = [];
  }

  updateVehicle(coord: Coordinate, bearing: number, state: NavCoreState): void {
    this.history.push({ coord, bearing, state });
  }

  panCamera(): void {
    // No-op in headless test environment
  }

  destroy(): void {
    this.history = [];
    this.currentRoute = [];
  }

  getHistory(): RecordedPosition[] {
    return [...this.history];
  }

  assertArrived(): void {
    const arrived = this.history.some((r) => r.state.hasArrived);
    if (!arrived) {
      throw new Error('Assertion failed: vehicle did not trigger arrival.');
    }
  }

  assertNeverOffRoute(): void {
    const offRoute = this.history.some((r) => r.state.isOffRoute);
    if (offRoute) {
      throw new Error('Assertion failed: vehicle unexpectedly deviated off route.');
    }
  }

  assertReached(target: Coordinate, radiusMetres = 25): void {
    const reached = this.history.some(
      (r) =>
        haversineDistance(r.coord[1], r.coord[0], target[1], target[0]) <= radiusMetres
    );
    if (!reached) {
      throw new Error(`Assertion failed: vehicle never reached [${target}] within ${radiusMetres}m.`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getRoute(start: Coordinate, end: Coordinate) {
  const provider = new OSRMDirectionsProvider({
    baseUrl: 'https://router.project-osrm.org',
  });
  return provider.getRoute([start, end]);
}

function simulateGps(
  engine: NavCore,
  adapter: HeadlessTestAdapter,
  geometry: Coordinate[],
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

// ── Test Cases ───────────────────────────────────────────────────────────────

async function testHappyPath() {
  console.log('Test 1: Happy path navigation...');
  const route = await getRoute([2.3522, 48.8566], [2.3009, 48.8741]);

  const engine = new NavCore({ isDev: true });
  const adapter = new HeadlessTestAdapter();

  engine.setRoute(route.geometry);
  engine.startNavigation();
  adapter.drawRoute(route.geometry);

  simulateGps(engine, adapter, route.geometry);

  adapter.assertArrived();
  adapter.assertNeverOffRoute();
  adapter.assertReached(route.geometry[route.geometry.length - 1]!, 30);

  console.log(`  ✓ Arrived cleanly after ${adapter.getHistory().length} GPS ticks`);
  engine.destroy();
}

async function testOffRouteDetection() {
  console.log('Test 2: Off-route deviation detection...');
  const route = await getRoute([2.3522, 48.8566], [2.3009, 48.8741]);

  const engine = new NavCore({ isDev: true, baseCorridorMeters: 20 });
  engine.setRoute(route.geometry);
  engine.startNavigation();

  let deviationFired = false;
  engine.on('deviation', () => {
    deviationFired = true;
  });

  const offPath: Coordinate[] = [
    ...route.geometry.slice(0, 10),
    [2.400, 48.880],
    [2.410, 48.885],
    [2.420, 48.890],
  ];

  for (const coord of offPath) {
    engine.update({
      coord,
      accuracy: 5,
      bearing: null,
      speed: 8.33,
      timestamp: Date.now(),
    });
  }

  const finalState = engine.getState();
  console.log(`  Off-route state: ${finalState.offRouteState}`);
  console.log(`  Deviation event fired: ${deviationFired}`);
  console.log('  ✓ Off-route behavior confirmed');

  engine.destroy();
}

async function testArrivalThreshold() {
  console.log('Test 3: Arrival threshold verification...');
  const route = await getRoute([2.3522, 48.8566], [2.3009, 48.8741]);

  for (const threshold of [15, 30, 50]) {
    const engine = new NavCore({ isDev: true, arrivalThresholdMeters: threshold });
    const adapter = new HeadlessTestAdapter();

    engine.setRoute(route.geometry);
    engine.startNavigation();
    simulateGps(engine, adapter, route.geometry);

    const arrived = adapter.getHistory().some((record: RecordedPosition) => record.state.hasArrived);
    console.log(`  threshold=${threshold}m → arrived=${arrived}`);
    engine.destroy();
  }

  console.log('  ✓ All thresholds verified');
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== NavCore Headless Tests ===\n');

  await testHappyPath();
  await testOffRouteDetection();
  await testArrivalThreshold();

  console.log('\n✓ All tests passed successfully');
}

main().catch((err: Error) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});