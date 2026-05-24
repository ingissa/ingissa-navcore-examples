/**
 * Example 10 Ã¢â‚¬â€ Parallel Road Resolver
 *
 * Demonstrates:
 * - ParallelRoadResolver standalone usage (without NavCore engine)
 * - U-turn detection with isLikelyUTurn()
 * - Scoring candidates with bearing + inertia penalties
 * - How the resolver fixes dual carriageway snap ambiguity
 *
 * Run: npx tsx examples/10-parallel-road-resolver/index.ts
 */

import {
  ParallelRoadResolver,
  type SnapCandidate,
} from '@ingissa/navcore-core';

function main() {
  const resolver = new ParallelRoadResolver({
    bearingPenalty: 80,
    bearingMismatchThresholdDeg: 60,
    inertiaPenalty: 40,
    inertiaSegmentDist: 3,
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Scenario 1: Dual carriageway disambiguation Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('=== Scenario 1: Dual carriageway ===\n');
  console.log('Vehicle heading NORTH (bearing ~0Ã‚Â°)');
  console.log('Two parallel road segments Ã¢â‚¬â€ one going north, one going south\n');

  const northSegA: [number, number] = [2.350, 48.856];
  const northSegB: [number, number] = [2.350, 48.858]; // bearing ~0Ã‚Â° (north)
  const southSegA: [number, number] = [2.352, 48.858];
  const southSegB: [number, number] = [2.352, 48.856]; // bearing ~180Ã‚Â° (south)

  const candidates: SnapCandidate[] = [
    {
      segmentIndex: 5,
      projectedCoord: [2.350, 48.857],
      distanceMetres: 8,   // slightly closer
      segA: northSegA,
      segB: northSegB,
    },
    {
      segmentIndex: 10,
      projectedCoord: [2.352, 48.857],
      distanceMetres: 12,  // slightly further
      segA: southSegA,
      segB: southSegB,
    },
  ];

  const vehicleBearing = 5; // heading roughly north
  const resolved = resolver.resolve(candidates, vehicleBearing, null);

  console.log('Candidates (before resolution):');
  candidates.forEach(c =>
    console.log(`  Segment ${c.segmentIndex}: dist=${c.distanceMetres}m`)
  );

  console.log('\nResolved order (winner first):');
  resolved.forEach((c, i) => {
    const winner = i === 0 ? 'Ã¢Å“â€¦ WINNER' : '  ';
    console.log(
      `${winner} Segment ${c.segmentIndex}: ` +
      `dist=${c.distanceMetres}m, ` +
      `bearingDelta=${c.bearingDeltaDeg?.toFixed(0)}Ã‚Â°, ` +
      `score=${c.score.toFixed(0)}, ` +
      `inertia=${c.inertiaPenaltyApplied}`
    );
  });

  // Without resolver: segment 5 wins (it's 4m closer)
  // With resolver: segment 5 still wins because bearing matches
  console.log('\nÃ¢â€ â€™ Both agree here because the closer segment also matches bearing.\n');

  // Ã¢â€â‚¬Ã¢â€â‚¬ Scenario 2: U-turn snap prevention Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('=== Scenario 2: U-turn snap prevention ===\n');
  console.log('Vehicle heading SOUTH (bearing ~180Ã‚Â°) but snapper found segment going NORTH\n');

  const uTurnCandidates: SnapCandidate[] = [
    {
      segmentIndex: 3,
      projectedCoord: [2.350, 48.857],
      distanceMetres: 5,   // very close Ã¢â‚¬â€ wrong direction
      segA: northSegA,
      segB: northSegB,     // this segment goes NORTH
    },
    {
      segmentIndex: 8,
      projectedCoord: [2.351, 48.857],
      distanceMetres: 15,  // further away Ã¢â‚¬â€ correct direction
      segA: southSegA,
      segB: southSegB,     // this segment goes SOUTH
    },
  ];

  const uTurnBearing = 175; // heading south
  const uResolved = resolver.resolve(uTurnCandidates, uTurnBearing, null);

  console.log('Without resolver: segment 3 would win (5m vs 15m)');
  console.log('\nWith resolver (winner first):');
  uResolved.forEach((c, i) => {
    const winner = i === 0 ? 'Ã¢Å“â€¦ WINNER' : '  ';
    console.log(
      `${winner} Segment ${c.segmentIndex}: ` +
      `score=${c.score.toFixed(0)} ` +
      `(dist=${c.distanceMetres}m + bearingPenalty=${(c.score - c.distanceMetres).toFixed(0)})`
    );
  });
  console.log('\nÃ¢â€ â€™ Resolver correctly prefers segment 8 (south) despite being further.\n');

  // Ã¢â€â‚¬Ã¢â€â‚¬ Scenario 3: isLikelyUTurn Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('=== Scenario 3: isLikelyUTurn() ===\n');
  const cases = [
    { bearing: 5,   segA: northSegA, segB: northSegB, label: 'North vehicle on north road' },
    { bearing: 175, segA: northSegA, segB: northSegB, label: 'South vehicle on north road' },
    { bearing: 90,  segA: northSegA, segB: northSegB, label: 'East vehicle on north road' },
  ];

  for (const c of cases) {
    const uturn = resolver.isLikelyUTurn(c.bearing, c.segA, c.segB);
    console.log(`  ${uturn ? 'Ã°Å¸â€â€ž U-TURN' : 'Ã¢Å“â€¦ OK    '} Ã¢â‚¬â€ ${c.label}`);
  }
}

main();


