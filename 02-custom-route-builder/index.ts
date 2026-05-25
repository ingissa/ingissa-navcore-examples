/**
 * Example 02 - Custom Route Builder
 *
 * Demonstrates:
 * - Building a route from scratch with waypoints
 * - Chunking for API limits
 * - GPX import/export
 * - GeoJSON import/export
 *
 * Run: npx tsx 02-custom-route-builder/index.ts
 */

import { CustomRouteBuilder, OSRMDirectionsProvider } from '@ingissa/navcore-core';
import { PARIS_MOCK_ROUTE, MOCK_FALLBACK_MESSAGE } from '../shared/mock-data';

async function main() {

  // -- Part A: Build a route from waypoints ----------------------------------
  console.log('=== Part A: Build from waypoints ===\n');

  const builder = new CustomRouteBuilder();

  const wp1 = builder.addWaypoint([2.3522, 48.8566], { name: 'Paris Centre' });
  const wp2 = builder.addWaypoint([2.3400, 48.8650], { name: 'Checkpoint 1' });
  const wp3 = builder.addWaypoint([2.3200, 48.8700], { name: 'Checkpoint 2' });
  const wp4 = builder.addWaypoint([2.3009, 48.8741], { name: 'Arc de Triomphe' });

  console.log(`Builder has ${builder.size} waypoints`);
  builder.getWaypoints().forEach((wp, i) => {
    console.log(`  ${i + 1}. [${wp.coord}] - ${wp.options?.name ?? '(unnamed)'}`);
  });

  // -- Part B: Get routed geometry via OSRM ----------------------------------
  console.log('\n=== Part B: Get routed geometry ===\n');

  const provider = new OSRMDirectionsProvider({
    baseUrl: 'http://router.project-osrm.org',
  });

  // Route all waypoints through OSRM (handles chunking automatically)
  const waypoints = builder.getWaypoints().map(wp => wp.coord);
  
  let route;
  try {
    console.log('Fetching route from OSRM...');
    route = await provider.getRoute(waypoints);
  } catch {
    console.log(MOCK_FALLBACK_MESSAGE);
    route = PARIS_MOCK_ROUTE;
  }
  
  console.log(`Routed: ${route.geometry.length} points, ${(route.distance / 1000).toFixed(2)}km`);

  // -- Part C: Chunking for large routes ------------------------------------ 
  console.log('\n=== Part C: Chunk strategy ===\n');

  const largeBuilder = new CustomRouteBuilder();
  for (let i = 0; i < 60; i++) {
    largeBuilder.addWaypoint([2.30 + i * 0.005, 48.85]);
  }

  console.log(`Large route: ${largeBuilder.size} waypoints`);

  const chunks25 = largeBuilder.chunk('OVERLAP_1', 25);
  console.log(`OVERLAP_1 with 25/chunk   ${chunks25.length} chunks (sizes: ${chunks25.map(c => c.length).join(', ')})`);

  const chunks10 = largeBuilder.chunk('OVERLAP_2', 10);
  console.log(`OVERLAP_2 with 10/chunk   ${chunks10.length} chunks`);

  // -- Part D: GPX Export / Import ------------------------------------------ 
  console.log('\n=== Part D: GPX export/import ===\n');

  const gpx = builder.toGPX();
  console.log('GPX export (first 200 chars):');
  console.log(gpx.slice(0, 200) + '...\n');

  const importedBuilder = new CustomRouteBuilder();
  importedBuilder.fromGPX(gpx);
  console.log(`Imported ${importedBuilder.size} waypoints from GPX`);

  // -- Part E: GeoJSON Export / Import --------------------------------------
  console.log('\n=== Part E: GeoJSON export/import ===\n');

  const geojson = builder.toGeoJSON();
  console.log(`GeoJSON has ${geojson.features.length} features (${geojson.features.filter(f => f.geometry.type === 'Point').length} points + 1 LineString)`);

  const geojsonBuilder = new CustomRouteBuilder();
  geojsonBuilder.fromGeoJSON(geojson);
  console.log(`Re-imported ${geojsonBuilder.size} waypoints from GeoJSON`);

  // -- Part F: Straight-line (no provider needed) ----------------------------
  console.log('\n=== Part F: Straight-line geometry ===\n');
  const { geometry, waypoints: wps } = builder.buildStraightLine();
  console.log(`Straight-line: ${geometry.length} points, ${wps.length} waypoints`);
}

main().catch(console.error);
