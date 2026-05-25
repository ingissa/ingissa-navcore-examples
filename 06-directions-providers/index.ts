/**
 * Example 06 - Directions Providers Comparison
 *
 * Fetches the same route from all three built-in providers
 * and compares the results side by side.
 *
 * Requirements: OSRM public server + ORS API key
 *
 * Run: ORS_KEY=your-key npx tsx examples/06-directions-providers/index.ts
 */

import {
  OSRMDirectionsProvider,
  ValhallaDirectionsProvider,
  OpenRouteServiceProvider,
  type DirectionsResult,
} from '@ingissa/navcore-core';
// @ts-ignore
import { MapboxDirectionsProvider } from '@ingissa/navcore-mapbox';
import { PARIS_MOCK_ROUTE } from '../shared/mock-data';

const START: [number, number] = [2.3522, 48.8566];
const END:   [number, number] = [2.3009, 48.8741];

async function fetchSafe(
  name: string,
  fn: () => Promise<DirectionsResult>
): Promise<void> {
  try {
    const t0 = Date.now();
    const result = await fn();
    const ms = Date.now() - t0;
    console.log(`  ${name}`);
    console.log(`   Points : ${result.geometry.length}`);
    console.log(`   Distance: ${(result.distance / 1000).toFixed(2)} km`);
    console.log(`   Duration: ${Math.round(result.duration / 60)} min`);
    console.log(`   Time    : ${ms}ms\n`);
  } catch (err: any) {
    if (err.message.includes('fetch failed') || err.message.includes('UND_ERR_SOCKET')) {
      console.log(`  ${name} (MOCK)`);
      // Simulate slight variations in providers using the mock data
      const salt = name.length % 5;
      console.log(`   Points : ${PARIS_MOCK_ROUTE.geometry.length + salt}`);
      console.log(`   Distance: ${(PARIS_MOCK_ROUTE.distance / 1000 + salt/10).toFixed(2)} km`);
      console.log(`   Duration: ${Math.round(PARIS_MOCK_ROUTE.duration / 60 + salt)} min`);
      console.log(`   Time    : ${10 + salt}ms\n`);
    } else {
      console.log(`  ${name}: ${err.message}\n`);
    }
  }
}

async function main() {
  console.log('=== Directions Provider Comparison ===\n');
  console.log(`Route: [${START}] -> [${END}]\n`);

  // 1. OSRM (public server - use self-hosted in production)
  await fetchSafe('OSRM (public demo)', () =>
    new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' })
      .getRoute([START, END])
  );

  // 2. Valhalla (public OSM instance)
  await fetchSafe('Valhalla (OSM public)', () =>
    new ValhallaDirectionsProvider({ baseUrl: 'https://valhalla1.openstreetmap.de' })
      .getRoute([START, END])
  );

  // 3. OpenRouteService (requires API key)
  const orsKey = process.env['ORS_KEY'];
  if (orsKey || true) { // Force attempt to trigger mock in StackBlitz
    await fetchSafe('OpenRouteService', () =>
      new OpenRouteServiceProvider({ apiKey: orsKey || 'mock-key' })
        .getRoute([START, END])
    );
  }

  // 4. Profile switching - all providers support the DirectionsOptions interface
  console.log('=== Profile comparison (OSRM) ===\n');
  const osrm = new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' });

  for (const profile of ['driving', 'cycling', 'walking'] as const) {
    await fetchSafe(`OSRM ${profile}`, () => osrm.getRoute([START, END], { profile }));
  }

  // 5. Chunking demo
  console.log('=== Chunking (many waypoints) ===\n');
  const manyWaypoints: [number, number][] = Array.from({ length: 30 }, (_, i) => [
    2.30 + i * 0.005,
    48.85,
  ]);

  await fetchSafe(`OSRM (${manyWaypoints.length} waypoints, auto-chunked)`, () =>
    new OSRMDirectionsProvider({
      baseUrl: 'http://router.project-osrm.org',
      maxWaypointsPerChunk: 10,
    }).getRoute(manyWaypoints)
  );
}

main();
