import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinate, LocationSample, NeutralRoute } from './types.ts';
import {
  getRouteMetrics,
  sampleRouteAtDistance,
} from '../routing/routeMetrics.ts';
import { sampleWrongTurnReplay } from './wrongTurnReplay.ts';
import capturedReplayTrace from './fixtures/capturedWrongTurnReplay.ts';
import { playTimestampedSamples } from './timestampedReplay.ts';

const capturedSamples = capturedReplayTrace.samples.map((sample) => {
  const coordinate: Coordinate = [sample.coordinate[0], sample.coordinate[1]];
  return {
    elapsedMs: sample.elapsedMs,
    coordinate,
    bearingDegrees: sample.bearingDegrees,
    accuracyMeters: sample.accuracyMeters,
    speedMetersPerSecond: sample.speedMetersPerSecond,
  };
});
const capturedReplayDurationMs = capturedReplayTrace.durationMs;

type ReplayScenario =
  | 'wrong-turn'
  | 'missed-turn-straight'
  | 'missed-turn-straight-stall'
  | 'deviation-from-current-position';

export const DEVIATION_REPLAY_CONFIRMATION_WINDOW_MS = 2_000;
const DEVIATION_REPLAY_INTERVAL_MS = 200;
const DEVIATION_REPLAY_DURATION_MS = 10_000;
const DEVIATION_REPLAY_SPEED_MPS = 10;

export interface MissedTurnReplaySample {
  elapsedMs: number;
  coordinate: Coordinate;
  bearingDegrees: number;
  accuracyMeters: number;
  speedMetersPerSecond: number;
}

export interface TimestampedReplayMetrics {
  expectedSamples: number;
  deliveredSamples: number;
  maximumInterSampleGapMs: number;
  medianInterSampleGapMs: number;
}

function getTimestampedReplayMetrics(
  expectedSamples: number,
  deliveryTimes: readonly number[],
): TimestampedReplayMetrics {
  const gaps = deliveryTimes.slice(1).map(
    (time, index) => time - deliveryTimes[index],
  );
  const sortedGaps = [...gaps].sort((left, right) => left - right);
  const middle = Math.floor(sortedGaps.length / 2);
  return {
    expectedSamples,
    deliveredSamples: deliveryTimes.length,
    maximumInterSampleGapMs: Math.max(0, ...gaps),
    medianInterSampleGapMs: sortedGaps.length === 0
      ? 0
      : sortedGaps.length % 2 === 0
        ? (sortedGaps[middle - 1] + sortedGaps[middle]) / 2
        : sortedGaps[middle],
  };
}

function getMissedTurnSample(
  samples: readonly MissedTurnReplaySample[] | undefined,
  index: number,
): MissedTurnReplaySample {
  const sample = samples?.[index];
  if (!sample) {
    throw new Error('The missed-turn replay fixture is missing its location samples.');
  }
  return sample;
}

function computeDestination(
  coordinate: Coordinate,
  bearingDegrees: number,
  distanceMeters: number,
): Coordinate {
  const radians = (bearingDegrees * Math.PI) / 180;
  const latitudeRadians = (coordinate[1] * Math.PI) / 180;
  return [
    coordinate[0] +
      (distanceMeters * Math.sin(radians)) / (111_320 * Math.max(0.1, Math.cos(latitudeRadians))),
    coordinate[1] + (distanceMeters * Math.cos(radians)) / 111_320,
  ];
}

/** A continuous physical GPS path starting at the exact position at click time. */
export function createDeviationFromCurrentPosition(
  start: LocationSample,
): MissedTurnReplaySample[] {
  const departureBearing = (start.bearing + 90) % 360;
  const stepMeters = DEVIATION_REPLAY_SPEED_MPS * (DEVIATION_REPLAY_INTERVAL_MS / 1_000);
  const samples: MissedTurnReplaySample[] = [{
    elapsedMs: 0,
    coordinate: [start.coordinate[0], start.coordinate[1]],
    bearingDegrees: departureBearing,
    accuracyMeters: Math.max(3, start.accuracyMeters),
    speedMetersPerSecond: DEVIATION_REPLAY_SPEED_MPS,
  }];
  let coordinate: Coordinate = [start.coordinate[0], start.coordinate[1]];
  const sampleCount = DEVIATION_REPLAY_DURATION_MS / DEVIATION_REPLAY_INTERVAL_MS;
  for (let index = 1; index <= sampleCount; index += 1) {
    coordinate = computeDestination(coordinate, departureBearing, stepMeters);
    samples.push({
      elapsedMs: index * DEVIATION_REPLAY_INTERVAL_MS,
      coordinate,
      bearingDegrees: departureBearing,
      accuracyMeters: Math.max(3, start.accuracyMeters),
      speedMetersPerSecond: DEVIATION_REPLAY_SPEED_MPS,
    });
  }
  return samples;
}

export function useReplaySource(
  route: NeutralRoute | null,
  useCapturedReplayTrace = false,
  missedTurnSamples?: readonly MissedTurnReplaySample[],
  wrongTurnSamples?: readonly MissedTurnReplaySample[],
  stallSamples?: readonly MissedTurnReplaySample[],
  onTimestampedSample?: (
    sample: MissedTurnReplaySample,
    timestamp: number,
    index: number,
  ) => void,
) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 4 | 8>(1);
  const [wrongTurnActive, setWrongTurnActive] = useState(false);
  const [wrongTurnElapsedMs, setWrongTurnElapsedMs] = useState(0);
  const [capturedTraceIndex, setCapturedTraceIndex] = useState(0);
  const [replayScenario, setReplayScenario] = useState<ReplayScenario>('wrong-turn');
  const [currentPositionDeviationSamples, setCurrentPositionDeviationSamples] = useState<
    readonly MissedTurnReplaySample[] | undefined
  >(undefined);
  const timestampedReplayStartTimestampRef = useRef<number | null>(null);
  const timestampedReplayStartClockRef = useRef<number | null>(null);
  const timestampedReplayAbortRef = useRef<AbortController | null>(null);
  const sampleDeliveryTimesRef = useRef<number[]>([]);
  const deliveredSampleIndexRef = useRef(-1);
  const timestampedRunCompletedRef = useRef(false);
  const sampleHandlerRef = useRef(onTimestampedSample);
  sampleHandlerRef.current = onTimestampedSample;

  const durationSeconds = Math.max(route?.durationSeconds ?? 1, 1);
  const isCapturedTrace = useCapturedReplayTrace && replayScenario === 'wrong-turn';
  const timestampedSamples =
    replayScenario === 'deviation-from-current-position'
      ? currentPositionDeviationSamples
      : replayScenario === 'missed-turn-straight'
      ? missedTurnSamples
      : replayScenario === 'missed-turn-straight-stall'
        ? stallSamples
        : isCapturedTrace
          ? capturedSamples
          : wrongTurnSamples;
  const isTimestampedReplay = wrongTurnActive && timestampedSamples !== undefined;
  const activeTimestampedSamplesRef = useRef(timestampedSamples);
  activeTimestampedSamplesRef.current = timestampedSamples;
  const activeReplayScenarioRef = useRef(replayScenario);
  activeReplayScenarioRef.current = replayScenario;
  const logTimestampedReplayStopped = useCallback((reason: string) => {
    const samples = activeTimestampedSamplesRef.current;
    const deliveredAt = sampleDeliveryTimesRef.current;
    if (
      !timestampedReplayAbortRef.current ||
      timestampedRunCompletedRef.current ||
      !samples ||
      deliveredAt.length >= samples.length
    ) {
      return;
    }

    console.info(`[navigation-poc] TIMESTAMPED_REPLAY_STOPPED ${JSON.stringify({
      scenario: activeReplayScenarioRef.current,
      ...getTimestampedReplayMetrics(samples.length, deliveredAt),
      appSchedulingClock: 'performance.now() (monotonic milliseconds)',
      engineInputTimestampClock: 'Date.now() epoch milliseconds plus fixture elapsed time',
      reason,
    })}`);
    timestampedRunCompletedRef.current = true;
  }, []);
  const missedTurnReplayDurationMs = missedTurnSamples?.at(-1)?.elapsedMs ?? 0;
  const stallReplayDurationMs = stallSamples?.at(-1)?.elapsedMs ?? 0;
  const wrongTurnFixtureDurationMs = wrongTurnSamples?.at(-1)?.elapsedMs ?? 0;
  const activeWrongTurnDurationMs =
    replayScenario === 'deviation-from-current-position'
      ? currentPositionDeviationSamples?.at(-1)?.elapsedMs ?? 0
      : replayScenario === 'missed-turn-straight'
      ? missedTurnReplayDurationMs
      : replayScenario === 'missed-turn-straight-stall'
        ? stallReplayDurationMs
        : isCapturedTrace
          ? capturedReplayDurationMs
          : wrongTurnFixtureDurationMs;
  const metrics = useMemo(
    () => (route ? getRouteMetrics(route.geometry) : null),
    [route],
  );

  const latestPositionRef = useRef<LocationSample | null>(null);

  // When a new route arrives (initial load or after reroute)
  useEffect(() => {
    logTimestampedReplayStopped('Route changed while replay was active.');
    setElapsedSeconds(0);
    setIsPlaying(true);
    setWrongTurnActive(false);
    setWrongTurnElapsedMs(0);
    setCapturedTraceIndex(0);
    setReplayScenario('wrong-turn');
    setCurrentPositionDeviationSamples(undefined);
    timestampedReplayAbortRef.current?.abort();
    timestampedReplayStartTimestampRef.current = null;
    timestampedReplayStartClockRef.current = null;
    deliveredSampleIndexRef.current = -1;
    sampleDeliveryTimesRef.current = [];
  }, [logTimestampedReplayStopped, route]);

  // Timer loop
  useEffect(() => {
    if (!isPlaying || isTimestampedReplay) {
      return;
    }

    let previousTimestamp = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const deltaSeconds = (now - previousTimestamp) / 1000;
      previousTimestamp = now;

      if (wrongTurnActive) {
        setWrongTurnElapsedMs((current) =>
          Math.min(activeWrongTurnDurationMs, current + deltaSeconds * speedMultiplier * 1000),
        );
        return;
      }

      if (route) {
        setElapsedSeconds((current) => Math.min(durationSeconds, current + deltaSeconds * speedMultiplier));
      }
    }, 100);

    return () => clearInterval(timer);
  }, [
    activeWrongTurnDurationMs,
    durationSeconds,
    isTimestampedReplay,
    isPlaying,
    replayScenario,
    route,
    speedMultiplier,
    wrongTurnActive,
  ]);

  useEffect(() => {
    if (!isPlaying || !isTimestampedReplay || !timestampedSamples) {
      return;
    }

    const startTimestamp = timestampedReplayStartTimestampRef.current;
    const startClock = timestampedReplayStartClockRef.current;
    if (startTimestamp === null || startClock === null) {
      return;
    }

    const firstUndeliveredIndex = deliveredSampleIndexRef.current + 1;
    const remainingSamples = timestampedSamples.slice(firstUndeliveredIndex);
    if (remainingSamples.length === 0) {
      setIsPlaying(false);
      return;
    }

    const controller = new AbortController();
    timestampedReplayAbortRef.current = controller;
    console.info(`[navigation-poc] TIMESTAMPED_REPLAY_STARTED ${JSON.stringify({
      scenario: replayScenario,
      expectedSamples: timestampedSamples.length,
      alreadyDeliveredSamples: firstUndeliveredIndex,
      appSchedulingClock: 'performance.now() (monotonic milliseconds)',
      engineInputTimestampClock: 'Date.now() epoch milliseconds plus fixture elapsed time',
      engineInternalClock: 'Not observable through the public integration',
    })}`);
    void playTimestampedSamples({
      startClockMs: startClock,
      timestampOriginMs: startTimestamp,
      samples: remainingSamples,
      signal: controller.signal,
      onSample: (sample, offset, timestamp, deliveredAt) => {
        const index = firstUndeliveredIndex + offset;
        if (!sampleHandlerRef.current) {
          throw new Error('Timestamped replay has no navigation sample receiver.');
        }
        sampleHandlerRef.current(sample, timestamp, index);
        deliveredSampleIndexRef.current = index;
        sampleDeliveryTimesRef.current.push(deliveredAt);
        setCapturedTraceIndex(index);
      },
    }).then(
      (result) => {
        if (!controller.signal.aborted) {
          timestampedRunCompletedRef.current = true;
          const gaps = sampleDeliveryTimesRef.current
            .slice(1)
            .map((time, gapIndex) => time - sampleDeliveryTimesRef.current[gapIndex]);
          const sortedGaps = [...gaps].sort((left, right) => left - right);
          const middle = Math.floor(sortedGaps.length / 2);
          console.info(`[navigation-poc] TIMESTAMPED_REPLAY_COMPLETE ${JSON.stringify({
            scenario: replayScenario,
            expectedSamples: timestampedSamples.length,
            deliveredSamples: sampleDeliveryTimesRef.current.length,
            maximumInterSampleGapMs: Math.max(0, ...gaps),
            medianInterSampleGapMs: sortedGaps.length === 0
              ? 0
              : sortedGaps.length % 2 === 0
                ? (sortedGaps[middle - 1] + sortedGaps[middle]) / 2
                : sortedGaps[middle],
            appSchedulingClock: 'performance.now() (monotonic milliseconds)',
            engineInputTimestampClock: 'Date.now() epoch milliseconds plus fixture elapsed time',
            engineInternalClock: 'Not observable through the public integration',
            schedulerDeliveredSamples: result.deliveredSamples,
          })}`);
          setIsPlaying(false);
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('[navigation-poc] Timestamped replay delivery failed.', error);
          setIsPlaying(false);
        }
      },
    );

    return () => {
      logTimestampedReplayStopped('Replay was interrupted before all samples were delivered.');
      controller.abort();
      if (timestampedReplayAbortRef.current === controller) {
        timestampedReplayAbortRef.current = null;
      }
    };
  }, [
    isPlaying,
    isTimestampedReplay,
    logTimestampedReplayStopped,
    replayScenario,
    timestampedSamples,
  ]);

  // Check replay end
  useEffect(() => {
    if (wrongTurnActive && !isTimestampedReplay && wrongTurnElapsedMs >= activeWrongTurnDurationMs) {
      setIsPlaying(false);
    } else if (!wrongTurnActive && elapsedSeconds >= durationSeconds) {
      setIsPlaying(false);
    }
  }, [
    activeWrongTurnDurationMs,
    durationSeconds,
    elapsedSeconds,
    isTimestampedReplay,
    wrongTurnActive,
    wrongTurnElapsedMs,
  ]);

  // Compute live vehicle position
  const position = useMemo<LocationSample | null>(() => {
    if (!route || !metrics || route.geometry.length === 0) {
      return null;
    }

    if (wrongTurnActive) {
      if (replayScenario === 'deviation-from-current-position') {
        const sampleIndex = Math.min(
          capturedTraceIndex,
          (currentPositionDeviationSamples?.length ?? 1) - 1,
        );
        const sample = getMissedTurnSample(currentPositionDeviationSamples, sampleIndex);
        const pos: LocationSample = {
          coordinate: [sample.coordinate[0], sample.coordinate[1]],
          bearing: sample.bearingDegrees,
          accuracyMeters: sample.accuracyMeters,
          speedMetersPerSecond: sample.speedMetersPerSecond,
          timestamp:
            (timestampedReplayStartTimestampRef.current ?? Date.now()) + sample.elapsedMs,
        };
        latestPositionRef.current = pos;
        return pos;
      }
      if (replayScenario === 'missed-turn-straight' || replayScenario === 'missed-turn-straight-stall') {
        const activeSamples = replayScenario === 'missed-turn-straight-stall' ? stallSamples : missedTurnSamples;
        const sampleIndex = Math.min(
          capturedTraceIndex,
          (activeSamples?.length ?? 1) - 1,
        );
        const sample = getMissedTurnSample(activeSamples, sampleIndex);
        const pos: LocationSample = {
          coordinate: [sample.coordinate[0], sample.coordinate[1]],
          bearing: sample.bearingDegrees,
          accuracyMeters: sample.accuracyMeters,
          speedMetersPerSecond: sample.speedMetersPerSecond,
          timestamp:
            (timestampedReplayStartTimestampRef.current ?? Date.now()) + sample.elapsedMs,
        };
        latestPositionRef.current = pos;
        return pos;
      }

      if (isCapturedTrace) {
        const sample = capturedSamples[capturedTraceIndex];
        const pos: LocationSample = {
          coordinate: sample.coordinate,
          bearing: sample.bearingDegrees,
          accuracyMeters: sample.accuracyMeters,
          speedMetersPerSecond: sample.speedMetersPerSecond,
          timestamp:
            (timestampedReplayStartTimestampRef.current ?? Date.now()) + sample.elapsedMs,
        };
        latestPositionRef.current = pos;
        return pos;
      }

      // Fixture-based wrong-turn: use capturedTraceIndex (updated by timestamped delivery)
      if (wrongTurnSamples?.length) {
        const sampleIndex = Math.min(capturedTraceIndex, wrongTurnSamples.length - 1);
        const sample = wrongTurnSamples[sampleIndex];
        const pos: LocationSample = {
          coordinate: [sample.coordinate[0], sample.coordinate[1]],
          bearing: sample.bearingDegrees,
          accuracyMeters: sample.accuracyMeters,
          speedMetersPerSecond: sample.speedMetersPerSecond,
          timestamp:
            (timestampedReplayStartTimestampRef.current ?? Date.now()) + sample.elapsedMs,
        };
        latestPositionRef.current = pos;
        return pos;
      }

      // Fallback: legacy keyframe interpolation (only if no fixture provided)
      const sample = sampleWrongTurnReplay(wrongTurnElapsedMs);
      const pos: LocationSample = {
        ...sample,
        accuracyMeters: 5,
        speedMetersPerSecond: sample.speedMetersPerSecond * speedMultiplier,
        timestamp: Date.now(),
      };
      latestPositionRef.current = pos;
      return pos;
    }

    const progress = Math.min(elapsedSeconds / durationSeconds, 1);
    const sampled = sampleRouteAtDistance(route.geometry, metrics.totalMeters * progress);
    const cruiseSpeedMps = Math.max(10, (route.distanceMeters / durationSeconds) * speedMultiplier);

    const driftMeters = 8.5 + Math.sin(elapsedSeconds * 2.2) * 2.5;
    const perpBearing = (sampled.bearing + 90) % 360;
    const rawGpsCoord = computeDestination(sampled.coordinate, perpBearing, driftMeters);

    const pos: LocationSample = {
      coordinate: rawGpsCoord,
      bearing: sampled.bearing,
      accuracyMeters: 4.5,
      speedMetersPerSecond: cruiseSpeedMps,
      timestamp: Date.now(),
    };
    latestPositionRef.current = pos;
    return pos;
  }, [
    capturedTraceIndex,
    currentPositionDeviationSamples,
    durationSeconds,
    elapsedSeconds,
    isCapturedTrace,
    missedTurnSamples,
    metrics,
    replayScenario,
    route,
    stallSamples,
    speedMultiplier,
    wrongTurnActive,
    wrongTurnSamples,
    wrongTurnElapsedMs,
  ]);

  const togglePlayback = () => {
    const timestampedReplayComplete =
      isTimestampedReplay &&
      deliveredSampleIndexRef.current >= (timestampedSamples?.length ?? 0) - 1;
    if (
      wrongTurnActive &&
      (timestampedReplayComplete || wrongTurnElapsedMs >= activeWrongTurnDurationMs)
    ) {
      timestampedReplayStartTimestampRef.current = Date.now();
      timestampedReplayStartClockRef.current = performance.now();
      deliveredSampleIndexRef.current = -1;
      setCapturedTraceIndex(0);
      setWrongTurnElapsedMs(0);
      sampleDeliveryTimesRef.current = [];
      timestampedRunCompletedRef.current = false;
      setIsPlaying(true);
      return;
    }
    if (isTimestampedReplay && !isPlaying && !timestampedReplayComplete) {
      timestampedReplayStartTimestampRef.current =
        Date.now() - (timestampedSamples?.[deliveredSampleIndexRef.current]?.elapsedMs ?? 0);
      timestampedReplayStartClockRef.current =
        performance.now() - (timestampedSamples?.[deliveredSampleIndexRef.current]?.elapsedMs ?? 0);
    }
    setIsPlaying((playing) => !playing);
  };

  const cycleSpeed = () =>
    setSpeedMultiplier((current) => (current === 1 ? 2 : current === 2 ? 4 : current === 4 ? 8 : 1));

  const startWrongTurnReplay = (scenario: ReplayScenario = 'wrong-turn') => {
    if (scenario === 'deviation-from-current-position') {
      throw new Error('Use startDeviationFromCurrentPosition for this scenario.');
    }
    if (scenario === 'missed-turn-straight' && !missedTurnSamples?.length) {
      throw new Error('The missed-turn replay fixture is missing its location samples.');
    }
    if (scenario === 'missed-turn-straight-stall' && !stallSamples?.length) {
      throw new Error('The missed-turn stall replay fixture is missing its location samples.');
    }
    if (scenario === 'wrong-turn' && !useCapturedReplayTrace && !wrongTurnSamples?.length) {
      throw new Error('The wrong-turn replay fixture is missing its location samples.');
    }

    logTimestampedReplayStopped('Replay was replaced by a new scenario.');
    setElapsedSeconds(0);
    setWrongTurnElapsedMs(0);
    setCapturedTraceIndex(0);
    setCurrentPositionDeviationSamples(undefined);
    setReplayScenario(scenario);
    const samples = scenario === 'missed-turn-straight'
      ? missedTurnSamples
      : scenario === 'missed-turn-straight-stall'
        ? stallSamples
        : scenario === 'wrong-turn' && useCapturedReplayTrace
          ? capturedSamples
          : wrongTurnSamples;
    timestampedReplayAbortRef.current?.abort();
    timestampedReplayStartTimestampRef.current = samples ? Date.now() : null;
    timestampedReplayStartClockRef.current = samples ? performance.now() : null;
    deliveredSampleIndexRef.current = -1;
    sampleDeliveryTimesRef.current = [];
    timestampedRunCompletedRef.current = false;
    setWrongTurnActive(true);
    setIsPlaying(true);
  };

  const startDeviationFromCurrentPosition = (start: LocationSample): Coordinate[] => {
    const samples = createDeviationFromCurrentPosition(start);
    logTimestampedReplayStopped('Replay was replaced by a current-position deviation.');
    timestampedReplayAbortRef.current?.abort();
    setElapsedSeconds(0);
    setWrongTurnElapsedMs(0);
    setCapturedTraceIndex(0);
    setCurrentPositionDeviationSamples(samples);
    setReplayScenario('deviation-from-current-position');
    timestampedReplayStartTimestampRef.current = Date.now();
    timestampedReplayStartClockRef.current = performance.now();
    deliveredSampleIndexRef.current = -1;
    sampleDeliveryTimesRef.current = [];
    timestampedRunCompletedRef.current = false;
    setWrongTurnActive(true);
    setIsPlaying(true);
    return samples.map((sample) => sample.coordinate);
  };

  const restartRoute = () => {
    logTimestampedReplayStopped('Replay was reset.');
    setWrongTurnActive(false);
    setWrongTurnElapsedMs(0);
    setCapturedTraceIndex(0);
    setReplayScenario('wrong-turn');
    setCurrentPositionDeviationSamples(undefined);
    timestampedReplayAbortRef.current?.abort();
    timestampedReplayStartTimestampRef.current = null;
    timestampedReplayStartClockRef.current = null;
    deliveredSampleIndexRef.current = -1;
    sampleDeliveryTimesRef.current = [];
    setElapsedSeconds(0);
    setIsPlaying(true);
  };

  return {
    position,
    elapsedSeconds,
    isPlaying,
    speedMultiplier,
    wrongTurnActive,
    replayScenario,
    timestampedReplayActive: isTimestampedReplay,
    scenarioLabel:
      replayScenario === 'deviation-from-current-position'
        ? 'Deviation from current vehicle position'
        : replayScenario === 'missed-turn-straight'
        ? 'Missed turn, straight on replay'
        : replayScenario === 'missed-turn-straight-stall'
          ? 'Missed turn, straight on replay (3s stall)'
          : `Wrong turn replay${isCapturedTrace ? ' (captured trace)' : ''}`,
    inputSource:
      replayScenario === 'deviation-from-current-position'
        ? 'generated continuous GPS path from the position at click time'
        : replayScenario === 'missed-turn-straight' || replayScenario === 'missed-turn-straight-stall'
        ? 'saved Valhalla fixture; labeled replay scenario'
        : isCapturedTrace
          ? 'saved emulator trace; labeled replay scenario'
          : 'generated labeled replay scenario',
    wrongTurnSampleIndex: wrongTurnActive
      ? isTimestampedReplay
        ? capturedTraceIndex
        : Math.floor(wrongTurnElapsedMs / 100)
      : null,
    togglePlayback,
    cycleSpeed,
    startWrongTurnReplay,
    startDeviationFromCurrentPosition,
    deviationScenarioActive:
      wrongTurnActive && replayScenario === 'deviation-from-current-position',
    restartRoute,
  };
}
