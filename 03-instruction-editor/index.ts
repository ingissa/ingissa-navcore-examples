/**
 * Example 03 — Instruction Editor
 *
 * Demonstrates:
 * - Building a NavInstruction array from scratch using InstructionEditor
 * - Adding turn, exam-specific, and checkpoint instructions
 * - Attaching offsets to route geometry
 * - Using instructions with the NavCore engine
 *
 * Run: npx tsx examples/03-instruction-editor/index.ts
 */

import {
  NavCore,
  InstructionEditor,
  OSRMDirectionsProvider,
} from '@ingissa/navcore-core';

async function main() {
  const provider = new OSRMDirectionsProvider({
    baseUrl: 'http://router.project-osrm.org',
  });

  const waypoints: [number, number][] = [
    [2.3522, 48.8566],
    [2.3400, 48.8650],
    [2.3200, 48.8700],
    [2.3009, 48.8741],
  ];

  console.log('Fetching route...');
  const route = await provider.getRoute(waypoints);
  const geometry = route.geometry;
  console.log(`Route: ${geometry.length} points\n`);

  // ── Build instructions ────────────────────────────────────────────────────
  const editor = new InstructionEditor();

  editor
    .addDepart(geometry[0]!, 'Head north on Rue de Rivoli')
    .addTurn(
      geometry[Math.floor(geometry.length * 0.25)]!,
      'Turn left onto Avenue des Champs-Élysées',
      Math.floor(geometry.length * 0.25),
      { meta: { streetName: 'Avenue des Champs-Élysées' } }
    )
    .addExamPoint(
      geometry[Math.floor(geometry.length * 0.4)]!,
      'Check mirrors before changing lane',
      Math.floor(geometry.length * 0.4),
      { severity: 'warning' }
    )
    .addCheckpoint(
      geometry[Math.floor(geometry.length * 0.6)]!,
      Math.floor(geometry.length * 0.6),
      { zone: 'exam-zone-A' }
    )
    .addExamPoint(
      geometry[Math.floor(geometry.length * 0.75)]!,
      'Yield to pedestrians at crosswalk',
      Math.floor(geometry.length * 0.75),
      { severity: 'critical' }
    )
    .addTurn(
      geometry[Math.floor(geometry.length * 0.9)]!,
      'At the roundabout, take the 2nd exit',
      Math.floor(geometry.length * 0.9)
    )
    .addArrive(geometry[geometry.length - 1]!, 'You have reached the destination');

  // Attach cumulative offsets from route geometry (required for engine)
  editor.attachToCumulative(geometry);
  editor.sort();  // Ensure correct order

  console.log(`=== Instructions (${editor.size}) ===\n`);
  const rich = editor.toRichArray();
  rich.forEach((instr, i) => {
    console.log(`  ${i + 1}. [${instr.type.padEnd(12)}] ${instr.text}`);
    if (instr.severity) console.log(`     Severity: ${instr.severity}`);
    if (instr.cumulativeOffset !== undefined) {
      console.log(`     At: ${instr.cumulativeOffset.toFixed(0)}m`);
    }
  });

  // ── Use instructions with engine ──────────────────────────────────────────
  console.log('\n=== Running navigation ===\n');

  const DEV_BYPASS_KEY =
    'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';

  const engine = new NavCore({ licenseKey: DEV_BYPASS_KEY });
  engine.setRoute(geometry, editor.toArray());
  engine.startNavigation();

  engine.on('instruction', (instr: any) => {
    const rich = editor.toRichArray().find(r => r.geometryIndex === instr.geometryIndex);
    const tag = rich?.type === 'exam_point' ? `⚠️  [${rich.severity}]` : '🗣 ';
    console.log(`${tag} ${instr.text}`);
  });

  // Simulate through route
  for (let i = 0; i < geometry.length; i += 3) {
    engine.update({
      coord: geometry[i]!,
      accuracy: 5,
      bearing: null,
      speed: 8.33,
      timestamp: Date.now() + i * 100,
    });
    if (engine.getState().hasArrived) break;
  }

  engine.destroy();
}

main().catch(console.error);
