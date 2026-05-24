/**
 * Example 02 Ã¢â‚¬â€ Custom Route Builder
 *
 * Demonstrates:
 * - Building a route from scratch with waypoints
 * - Chunking for API limits
 * - GPX import/export
 * - GeoJSON import/export
 *
 * Run: npx tsx examples/02-custom-route-builder/index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { CustomRouteBuilder, OSRMDirectionsProvider } from '@ingissa/navcore-core';

async function main() {

  // Ã¢â€â‚¬Ã¢â€â‚¬ Part A: Build a route from waypoints Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('=== Part A: Build from waypoints ===\n');

  const builder = new CustomRouteBuilder();

  const wp1 = builder.addWaypoint([2.3522, 48.8566], { name: 'Paris Centre' });
  const wp2 = builder.addWaypoint([2.3400, 48.8650], { name: 'Checkpoint 1' });
  const wp3 = builder.addWaypoint([2.3200, 48.8700], { name: 'Checkpoint 2' });
  const wp4 = builder.addWaypoint([2.3009, 48.8741], { name: 'Arc de Triomphe' });

  console.log(`Builder has ${builder.size} waypoints`);
  builder.getWaypoints().forEach((wp, i) => {
    console.log(`  ${i + 1}. [${wp.coord}] Ã¢â‚¬â€ ${wp.options?.name ?? '(unnamed)'}`);
  });

  // Insert a waypoint between wp2 and wp3
  const extraId = builder.insertWaypoint([2.3300, 48.8670], wp2);
  console.log(`\nInserted extra waypoint after ${wp2}, builder now has ${builder.size} waypoints`);

  // Remove it again
  builder.removeWaypoint(extraId);
  console.log(`Removed extra waypoint, builder has ${builder.size} waypoints\n`);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Part B: Get routed geometry via OSRM Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('=== Part B: Get routed geometry ===\n');

  const provider = new OSRMDirectionsProvider({
    baseUrl: 'http://router.project-osrm.org',
  });

  // Route all waypoints through OSRM (handles chunking automatically)
  const waypoints = builder.getWaypoints().map(wp => wp.coord);
  const route = await provider.getRoute(waypoints);
  console.log(`Routed: ${route.geometry.length} points, ${(route.distance / 1000).toFixed(2)}km`);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Part C: Chunking for large routes Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('\n=== Part C: Chunk strategy ===\n');

  const largeBuilder = new CustomRouteBuilder();
  for (let i = 0; i < 60; i++) {
    largeBuilder.addWaypoint([2.30 + i * 0.005, 48.85]);
  }

  console.log(`Large route: ${largeBuilder.size} waypoints`);

  const chunks25 = largeBuilder.chunk('OVERLAP_1', 25);
  console.log(`OVERLAP_1 with 25/chunk Ã¢â€ â€™ ${chunks25.length} chunks (sizes: ${chunks25.map(c => c.length).join(', ')})`);

  const chunks10 = largeBuilder.chunk('OVERLAP_2', 10);
  console.log(`OVERLAP_2 with 10/chunk Ã¢â€ â€™ ${chunks10.length} chunks`);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Part D: GPX Export / Import Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('\n=== Part D: GPX export/import ===\n');

  const gpx = builder.toGPX();
  console.log('GPX export (first 200 chars):');
  console.log(gpx.slice(0, 200) + '...\n');

  const importedBuilder = new CustomRouteBuilder();
  importedBuilder.fromGPX(gpx);
  console.log(`Imported ${importedBuilder.size} waypoints from GPX`);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Part E: GeoJSON Export / Import Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('\n=== Part E: GeoJSON export/import ===\n');

  const geojson = builder.toGeoJSON();
  console.log(`GeoJSON has ${geojson.features.length} features (${geojson.features.filter(f => f.geometry.type === 'Point').length} points + 1 LineString)`);

  const geojsonBuilder = new CustomRouteBuilder();
  geojsonBuilder.fromGeoJSON(geojson);
  console.log(`Re-imported ${geojsonBuilder.size} waypoints from GeoJSON`);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Part F: Straight-line (no provider needed) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('\n=== Part F: Straight-line geometry ===\n');
  const { geometry, waypoints: wps } = builder.buildStraightLine();
  console.log(`Straight-line: ${geometry.length} points, ${wps.length} waypoints`);
}

main().catch(console.error);


