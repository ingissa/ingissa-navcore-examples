/**
 * Example 09 - Geofencing Engine
 *
 * Demonstrates circle + polygon zones, enter/exit/dwell events, isInside checks.
 * Run: npx tsx examples/09-geofencing/index.ts
 */

import { GeofencingEngine } from '@ingissa/navcore-core';

function main() {
  const geo = new GeofencingEngine({ dwellThresholdMs: 2000 });

  geo.addCircle('school-zone', 'School Zone', [2.3522, 48.8566], 100, { speedLimit: 30 });
  geo.addCircle('exam-area',   'Exam Center', [2.3300, 48.8600], 200);
  geo.addPolygon('city-center', 'Paris 1er', [
    [2.3400, 48.8530], [2.3600, 48.8530],
    [2.3600, 48.8650], [2.3400, 48.8650],
  ]);

  console.log('Zones:', geo.listIds().join(', '), '\n');

  const path: [number, number][] = [
    [2.3200, 48.8560], [2.3400, 48.8560], [2.3450, 48.8570],
    [2.3500, 48.8560], [2.3520, 48.8565], [2.3525, 48.8566],
    [2.3700, 48.8580], [2.3800, 48.8590],
  ];

  for (const coord of path) {
    const events = geo.update(coord);
    for (const evt of events) {
      const icon = evt.type === 'enter' ? ' ' : evt.type === 'exit' ? ' ' : ' ';
      console.log(`${icon} [${evt.type}] ${evt.id} at [${coord}]`);
    }
    if (!events.length) console.log(`  No events at [${coord}]`);
  }

  console.log('\n=== isInside checks ===');
  const test: [number, number] = [2.3520, 48.8565];
  for (const id of geo.listIds()) {
    console.log(`  ${geo.isInside(id, test) ? ' ' : ' '} ${id}`);
  }
}

main();
