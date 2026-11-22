import type { Coordinate } from './types.ts';

interface WrongTurnKeyframe {
  elapsedMs: number;
  coordinate: Coordinate;
  bearing: number;
}

// On-route phase: follows Victoria Embankment NE for ~11 s (SDK locks ON_ROUTE).
// Wrong-turn phase: at shape[5] junction, ignores the left-turn and drives due
//   East (95 deg) for 35 s at 7 m/s -- guaranteed to exit the corridor.
const keyframes: WrongTurnKeyframe[] = [
  {
    "elapsedMs": 0,
    "coordinate": [
      -0.119767,
      51.509168
    ],
    "bearing": 47.990929202343125
  },
  {
    "elapsedMs": 6487,
    "coordinate": [
      -0.11928,
      51.509441
    ],
    "bearing": 50.971727554979736
  },
  {
    "elapsedMs": 9316,
    "coordinate": [
      -0.119058,
      51.509553
    ],
    "bearing": 9.258086156445586
  },
  {
    "elapsedMs": 9993,
    "coordinate": [
      -0.119047,
      51.509595
    ],
    "bearing": 51.22285977524638
  },
  {
    "elapsedMs": 10679,
    "coordinate": [
      -0.118993,
      51.509622
    ],
    "bearing": 55.58016957215921
  },
  {
    "elapsedMs": 11495,
    "coordinate": [
      -0.118925,
      51.509651
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 12495,
    "coordinate": [
      -0.11882435053204074,
      51.50964551949156
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 13495,
    "coordinate": [
      -0.11872370106408146,
      51.50964003898312
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 14495,
    "coordinate": [
      -0.1186230515961222,
      51.50963455847469
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 15495,
    "coordinate": [
      -0.11852240212816292,
      51.50962907796625
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 16495,
    "coordinate": [
      -0.11842175266020366,
      51.50962359745781
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 17495,
    "coordinate": [
      -0.11832110319224438,
      51.509618116949376
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 18495,
    "coordinate": [
      -0.11822045372428512,
      51.509612636440934
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 19495,
    "coordinate": [
      -0.11811980425632584,
      51.5096071559325
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 20495,
    "coordinate": [
      -0.11801915478836658,
      51.509601675424065
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 21495,
    "coordinate": [
      -0.1179185053204073,
      51.50959619491562
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 22495,
    "coordinate": [
      -0.11781785585244804,
      51.50959071440719
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 23495,
    "coordinate": [
      -0.11771720638448877,
      51.509585233898754
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 24495,
    "coordinate": [
      -0.1176165569165295,
      51.50957975339031
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 25495,
    "coordinate": [
      -0.11751590744857023,
      51.50957427288188
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 26495,
    "coordinate": [
      -0.11741525798061096,
      51.509568792373436
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 27495,
    "coordinate": [
      -0.1173146085126517,
      51.509563311865
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 28495,
    "coordinate": [
      -0.11721395904469242,
      51.50955783135657
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 29495,
    "coordinate": [
      -0.11711330957673316,
      51.509552350848125
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 30495,
    "coordinate": [
      -0.11701266010877388,
      51.50954687033969
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 31495,
    "coordinate": [
      -0.11691201064081462,
      51.509541389831256
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 32495,
    "coordinate": [
      -0.11681136117285534,
      51.509535909322814
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 33495,
    "coordinate": [
      -0.11671071170489608,
      51.50953042881438
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 34495,
    "coordinate": [
      -0.1166100622369368,
      51.509524948305945
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 35495,
    "coordinate": [
      -0.11650941276897754,
      51.5095194677975
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 36495,
    "coordinate": [
      -0.11640876330101826,
      51.50951398728907
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 37495,
    "coordinate": [
      -0.116308113833059,
      51.50950850678063
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 38495,
    "coordinate": [
      -0.11620746436509972,
      51.50950302627219
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 39495,
    "coordinate": [
      -0.11610681489714046,
      51.50949754576376
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 40495,
    "coordinate": [
      -0.11600616542918119,
      51.509492065255316
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 41495,
    "coordinate": [
      -0.11590551596122192,
      51.50948658474688
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 42495,
    "coordinate": [
      -0.11580486649326266,
      51.509481104238446
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 43495,
    "coordinate": [
      -0.11570421702530338,
      51.509475623730005
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 44495,
    "coordinate": [
      -0.11560356755734412,
      51.50947014322157
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 45495,
    "coordinate": [
      -0.11550291808938484,
      51.509464662713135
    ],
    "bearing": 95
  },
  {
    "elapsedMs": 46495,
    "coordinate": [
      -0.11540226862142558,
      51.509459182204694
    ],
    "bearing": 95
  }
];

export const wrongTurnReplayDurationMs = keyframes.at(-1)?.elapsedMs ?? 0;

export function sampleWrongTurnReplay(elapsedMs: number) {
  const boundedElapsedMs = Math.max(0, Math.min(elapsedMs, wrongTurnReplayDurationMs));
  const nextIndex = keyframes.findIndex(({ elapsedMs: keyframeMs }) => keyframeMs >= boundedElapsedMs);
  const next = keyframes[Math.max(nextIndex, 0)];
  const previous = keyframes[Math.max(nextIndex - 1, 0)];
  const segmentDuration = next.elapsedMs - previous.elapsedMs;
  const progress = segmentDuration === 0 ? 0 : (boundedElapsedMs - previous.elapsedMs) / segmentDuration;
  const coordinate: Coordinate = [
    previous.coordinate[0] + (next.coordinate[0] - previous.coordinate[0]) * progress,
    previous.coordinate[1] + (next.coordinate[1] - previous.coordinate[1]) * progress,
  ];

  return {
    coordinate,
    bearing: previous.bearing + (next.bearing - previous.bearing) * progress,
    speedMetersPerSecond: 7,
  };
}
