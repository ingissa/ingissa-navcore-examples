/**
 * Example 07 — Voice Trigger Engine
 *
 * Demonstrates:
 * - VoiceTriggerEngine with speed-adaptive trigger windows
 * - Deduplication (same instruction not fired twice)
 * - Re-announce (fired again if still far away after first trigger)
 * - Priority levels
 * - Integration with browser SpeechSynthesis API (browser-only)
 *
 * Run: npx tsx examples/07-voice-triggers/index.ts
 * Browser: open examples/07-voice-triggers/browser.html
 */

import {
  NavCore,
  VoiceTriggerEngine,
  InstructionEditor,
  OSRMDirectionsProvider,
} from '@ingissa/navcore-core';

async function main() {
  const provider = new OSRMDirectionsProvider({ baseUrl: 'http://router.project-osrm.org' });
  const route = await provider.getRoute([[2.3522, 48.8566], [2.3009, 48.8741]]);
  const geometry = route.geometry;

  // Build instructions
  const editor = new InstructionEditor();
  const step = Math.floor(geometry.length / 5);
  editor
    .addDepart(geometry[0]!, 'Head north')
    .addTurn(geometry[step]!, 'In 200 metres, turn left', step)
    .addTurn(geometry[step * 2]!, 'At the roundabout, take the third exit', step * 2)
    .addExamPoint(geometry[step * 3]!, 'Check your mirrors', step * 3, { severity: 'warning' })
    .addTurn(geometry[step * 4]!, 'Turn right onto Rue de la Paix', step * 4)
    .addArrive(geometry[geometry.length - 1]!, 'You have arrived at your destination');

  editor.attachToCumulative(geometry);
  editor.sort();
  const instructions = editor.toArray();

  // Create voice engine
  const voice = new VoiceTriggerEngine({
    earlyTriggerMeters: 80,      // Trigger 80m before instruction
    lateTriggerMeters: 10,        // Give up if 10m past
    reannounceMeters: 250,        // Re-announce at 250m
  });
  voice.setInstructions(instructions);

  // Create nav engine
  const DEV_BYPASS_KEY =
    'eyJ0IjoicHJvIiwiZXhwIjo0OTMyNzAzMTU2MDAwLCJiaWQiOiJkZXYuYnlwYXNzIiwiZiI6WyIqIl19.MEQCIH4E4QNu9PuVsXHSnYmcqpCLk4QitiIH9hhY0Zm+YO5gAiAE7X3c47YQLUj7WPSGKw9Y7W2kBUR5GCnOMBwdBsYGgg==';

  const engine = new NavCore({ licenseKey: DEV_BYPASS_KEY });
  engine.setRoute(geometry, instructions);
  engine.startNavigation();

  // Collect triggered cues
  const triggeredCues: string[] = [];

  console.log('Simulating navigation with voice triggers...\n');

  for (let i = 0; i < geometry.length; i++) {
    const state = engine.update({
      coord: geometry[i]!,
      accuracy: 5,
      bearing: null,
      speed: 8.33,  // 30 km/h
      timestamp: Date.now() + i * 100,
    });

    const cue = voice.update(state);
    if (cue) {
      triggeredCues.push(cue.text);
      const distStr = cue.distanceMetres.toFixed(0).padStart(4);
      console.log(`  🗣  [${distStr}m, ${cue.priority.padEnd(6)}] "${cue.text}"`);
    }

    if (state.hasArrived) break;
  }

  console.log(`\nTotal cues fired: ${triggeredCues.length}`);
  console.log('\nAll cues:');
  triggeredCues.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
}

main().catch(console.error);
