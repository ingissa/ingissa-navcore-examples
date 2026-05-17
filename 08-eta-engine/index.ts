/**
 * Example 08 — ETA Engine
 *
 * Demonstrates:
 * - ETAEngine with rolling speed average
 * - Graceful handling of zero speed (stopped vehicle)
 * - isReliable flag
 * - Comparison of ETA at different speed profiles
 *
 * Run: npx tsx examples/08-eta-engine/index.ts
 */

import {
  NavCore,
  ETAEngine,
  OSRMDirectionsProvider,
} from '../../packages/core/src/index';

async function main() {
  const provider = new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' });
  const route = await provider.getRoute([[2.3522, 48.8566], [2.3009, 48.8741]]);
  const geometry = route.geometry;

  console.log(`Route: ${(route.distance / 1000).toFixed(2)}km`);
  console.log(`OSRM estimate: ${Math.round(route.duration / 60)} min\n`);

  // ── Scenario 1: Constant speed ────────────────────────────────────────────
  console.log('=== Scenario 1: Constant 30 km/h ===\n');
  await runSimulation(geometry, () => 8.33); // 30 km/h

  // ── Scenario 2: Variable speed ────────────────────────────────────────────
  console.log('\n=== Scenario 2: Variable speed (traffic) ===\n');
  await runSimulation(geometry, (i, total) => {
    // Slow down in the middle (simulate traffic)
    const progress = i / total;
    if (progress > 0.3 && progress < 0.7) return 2.0; // ~7 km/h
    return 11.1; // ~40 km/h
  });

  // ── Scenario 3: With stops ────────────────────────────────────────────────
  console.log('\n=== Scenario 3: With stop at red light ===\n');
  await runSimulation(geometry, (i, total) => {
    const progress = i / total;
    if (progress > 0.45 && progress < 0.55) return 0; // stopped
    return 8.33;
  });
}

async function runSimulation(
  geometry: [number, number][],
  speedFn: (i: number, total: number) => number
) {
  const engine = new NavCore({ isDev: true });
  const eta = new ETAEngine({ speedWindowSize: 5 });

  engine.setRoute(geometry);
  engine.startNavigation();

  const printInterval = Math.floor(geometry.length / 8);
  let lastEtaSeconds = 0;

  for (let i = 0; i < geometry.length; i++) {
    const speed = speedFn(i, geometry.length);
    const state = engine.update({
      coord: geometry[i]!,
      accuracy: 5,
      bearing: null,
      speed,
      timestamp: Date.now() + i * 200,
    });

    const result = eta.update(state);

    if (i % printInterval === 0) {
      const distKm = ((state.distanceToDestination ?? 0) / 1000).toFixed(2);
      const etaMin = result.isReliable ? Math.ceil(result.etaSeconds / 60) : '?';
      const speedKmh = (result.averageSpeedMs * 3.6).toFixed(0);
      const reliable = result.isReliable ? '✅' : '⏳';

      console.log(
        `  ${reliable} dist=${distKm}km  ` +
        `speed=${speedKmh}km/h  ` +
        `eta=${etaMin}min  ` +
        `(raw=${result.etaSeconds}s)`
      );

      lastEtaSeconds = result.etaSeconds;
    }

    if (state.hasArrived) {
      console.log('  🏁 Arrived!');
      break;
    }
  }

  engine.destroy();
}

main().catch(console.error);
