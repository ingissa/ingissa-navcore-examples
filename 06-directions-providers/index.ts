/**
 * Example 06 â€” Directions Providers Comparison
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
import { MapboxDirectionsProvider } from '@ingissa/navcore-mapbox';

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
    console.log(`âœ… ${name}`);
    console.log(`   Points : ${result.geometry.length}`);
    console.log(`   Distance: ${(result.distance / 1000).toFixed(2)} km`);
    console.log(`   Duration: ${Math.round(result.duration / 60)} min`);
    console.log(`   Time    : ${ms}ms\n`);
  } catch (err: any) {
    console.log(`âŒ ${name}: ${err.message}\n`);
  }
}

async function main() {
  console.log('=== Directions Provider Comparison ===\n');
  console.log(`Route: [${START}] â†’ [${END}]\n`);

  // 1. OSRM (public server â€” use self-hosted in production)
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
  if (orsKey) {
    await fetchSafe('OpenRouteService', () =>
      new OpenRouteServiceProvider({ apiKey: orsKey })
        .getRoute([START, END])
    );
  } else {
    console.log('âš ï¸  ORS_KEY not set â€” skipping OpenRouteService\n');
  }

  // 4. Profile switching â€” all providers support the DirectionsOptions interface
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


