import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Coordinate, NeutralRoute, RoutingProvider } from './src/navigation/types.ts';
import { RoutingError } from './src/navigation/types.ts';
import { GuidanceMap } from './src/components/GuidanceMap.tsx';
import { useNavigationSession } from './src/navigation/useNavigationSession.ts';
import { useReplaySource } from './src/navigation/useReplaySource.ts';
import { useForegroundLocation } from './src/location/useForegroundLocation.ts';
import { useRerouteOnOffRoute } from './src/navigation/useRerouteOnOffRoute.ts';
import { requestFreshReroute } from './src/navigation/freshReroute.ts';
import {
  createAttemptDeadline,
  RerouteAttemptCoordinator,
} from './src/navigation/rerouteAttemptCoordinator.ts';
import {
  useNavigationViewModel,
  type RerouteStatus,
} from './src/navigation/navigationViewModel.ts';
import { routeProgress, distanceBetween } from './src/routing/routeMetrics.ts';
import { createRoutingProvider, lastCoordinate } from './src/routing/valhallaClient.ts';
import keyModeFixtures from './tests/fixtures/navigation/key-mode-fixtures.json';

const routingMode = process.env.EXPO_PUBLIC_ROUTE_MODE === 'fixture' ? 'fixture' : 'valhalla';
const replayDiagnosticsEnabled =
  process.env.EXPO_PUBLIC_NAVCORE_REPLAY_DIAGNOSTICS === 'true';
const replaySampleDiagnosticsEnabled =
  process.env.EXPO_PUBLIC_NAVCORE_REPLAY_SAMPLE_LOGS === 'true';
const useCapturedReplayTrace =
  process.env.EXPO_PUBLIC_NAVCORE_CAPTURED_REPLAY === 'true';
const routeRenderTimeoutMs = 15_000;
const missedTurnFixture = keyModeFixtures.fixtures.find(
  (fixture) => fixture.name === 'missed-turn-straight',
);
if (!missedTurnFixture?.samples.length) {
  throw new Error('The missed-turn replay fixture is missing its location samples.');
}
const missedTurnReplaySamples = missedTurnFixture.samples.map((sample) => ({
  ...sample,
  coordinate: [sample.coordinate[0], sample.coordinate[1]] as Coordinate,
}));

const stallFixture = keyModeFixtures.fixtures.find(
  (fixture) => fixture.name === 'missed-turn-straight-stall',
);
const stallReplaySamples = (stallFixture?.samples ?? []).map((sample) => ({
  ...sample,
  coordinate: [sample.coordinate[0], sample.coordinate[1]] as Coordinate,
}));

const wrongTurnFixture = keyModeFixtures.fixtures.find(
  (fixture) => fixture.name === 'wrong-turn',
);
if (!wrongTurnFixture?.samples.length) {
  throw new Error('The wrong-turn replay fixture is missing its location samples.');
}
const wrongTurnReplaySamples = wrongTurnFixture.samples.map((sample) => ({
  ...sample,
  coordinate: [sample.coordinate[0], sample.coordinate[1]] as Coordinate,
}));
const appJsStartedAt = Date.now();
const provider: RoutingProvider = createRoutingProvider(
  routingMode,
  process.env.EXPO_PUBLIC_VALHALLA_URL,
);
const demoTrip = {
  origin: [-7.59, 33.57] as Coordinate,
  destination: [-7.585, 33.575] as Coordinate,
};

function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) {
    return '--';
  }
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(meters))} m`;
}

function logReroutePhase(
  phase: string,
  details: Record<string, unknown>,
) {
  console.info(JSON.stringify({
    eventType: 'reroute-phase',
    phase,
    monotonicTimestampMs: performance.now(),
    wallClockTimestamp: new Date().toISOString(),
    ...details,
  }));
}

function appendTrailPoint(trail: Coordinate[], coordinate: Coordinate) {
  const previous = trail.at(-1);
  if (previous && distanceBetween(previous, coordinate) < 5) {
    return trail;
  }
  return [...trail.slice(-79), coordinate];
}

export default function App() {
  const [route, setRoute] = useState<NeutralRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeRetryCount, setRouteRetryCount] = useState(0);
  const [rerouteStatus, setRerouteStatus] = useState<RerouteStatus>('idle');
  const [replayResetting, setReplayResetting] = useState(false);
  const [rerouteDurationMs, setRerouteDurationMs] = useState<number | null>(null);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [rawTrail, setRawTrail] = useState<Coordinate[]>([]);
  const [snappedTrail, setSnappedTrail] = useState<Coordinate[]>([]);
  const [simulatedDeviationPath, setSimulatedDeviationPath] = useState<Coordinate[]>([]);
  // Unlike the ordinary trails, this trace survives the route replacement so
  // the user can see the vehicle leave the old route before the new route
  // starts at the current GPS position.
  const [deviationTrail, setDeviationTrail] = useState<Coordinate[]>([]);
  const [sessionKey, setSessionKey] = useState(0);
  const [positionSource, setPositionSource] = useState<'replay' | 'gps'>('replay');
  const [routeOrigin, setRouteOrigin] = useState<Coordinate>(demoTrip.origin);
  const liveLocation = useForegroundLocation();
  const positionSourceRef = useRef(positionSource);
  positionSourceRef.current = positionSource;
  const latestPosition = useRef<ReturnType<typeof useReplaySource>['position']>(null);
  const previousRawPositionRef = useRef<Coordinate | null>(null);
  const rerouteAttemptsRef = useRef<RerouteAttemptCoordinator | null>(null);
  if (!rerouteAttemptsRef.current) {
    rerouteAttemptsRef.current = new RerouteAttemptCoordinator();
  }
  const cancelRouteRenderDeadlineRef = useRef<() => void>(() => {});
  const initialRouteRef = useRef<NeutralRoute | null>(null);
  const initialRouteLoggedRef = useRef(false);
  const replayStartTimestampRef = useRef<number | null>(null);
  const offRouteConfirmedAtRef = useRef<number | null>(null);
  const firstDeviatingAtRef = useRef<number | null>(null);
  const rerouteResponseAtRef = useRef<number | null>(null);
  const lastReplayStateLogRef = useRef<string | null>(null);
  const lastReplaySampleLogRef = useRef<number | null>(null);
  const pendingReplayStartSessionKeyRef = useRef<number | null>(null);
  const pendingReplayScenarioRef = useRef<'wrong-turn' | 'missed-turn-straight' | 'missed-turn-straight-stall'>('wrong-turn');
  const pendingRenderedRerouteRef = useRef<{
    route: NeutralRoute;
    scenario:
      | 'wrong-turn'
      | 'missed-turn-straight'
      | 'missed-turn-straight-stall'
      | 'deviation-from-current-position';
    attemptId: string;
    previousRoute: NeutralRoute;
    initialLocation: NonNullable<ReturnType<typeof useReplaySource>['position']>;
  } | null>(null);
  const replaySampleEngineRef = useRef<ReturnType<typeof useNavigationSession>['engine'] | null>(null);
  const latestSessionKeyRef = useRef(sessionKey);
  latestSessionKeyRef.current = sessionKey;

  const replay = useReplaySource(
    route,
    useCapturedReplayTrace,
    missedTurnReplaySamples,
    wrongTurnReplaySamples,
    stallReplaySamples,
    (sample, timestamp) => {
      if (positionSourceRef.current !== 'replay') {
        return;
      }
      const engine = replaySampleEngineRef.current;
      if (!engine) {
        throw new Error('Timestamped replay started before the navigation engine was ready.');
      }
      const location = {
        coordinate: sample.coordinate,
        bearing: sample.bearingDegrees,
        accuracyMeters: sample.accuracyMeters,
        speedMetersPerSecond: sample.speedMetersPerSecond,
        timestamp,
      };
      latestPosition.current = location;
      engine.update({
        coord: location.coordinate,
        accuracy: location.accuracyMeters,
        bearing: location.bearing,
        speed: location.speedMetersPerSecond,
        timestamp: location.timestamp,
      });
    },
  );
  const startWrongTurnReplayRef = useRef(replay.startWrongTurnReplay);
  startWrongTurnReplayRef.current = replay.startWrongTurnReplay;
  const activePosition = positionSource === 'gps' ? liveLocation.position : replay.position;
  const navigation = useNavigationSession(
    route,
    activePosition,
    positionSource === 'replay' && replay.timestampedReplayActive,
  );
  replaySampleEngineRef.current = navigation.engine;
  const startAtomicSession = navigation.startAtomicSession;
  const startAtomicSessionFor = navigation.startAtomicSessionFor;
  const isOffRoute = navigation.isOffRoute;
  const viewModel = useNavigationViewModel({
    lifecycleState: navigation.lifecycleState,
    offRouteState: navigation.offRouteState,
    isOffRoute,
    rerouteStatus,
    replayStatus: replayResetting
      ? 'resetting'
      : replay.wrongTurnActive
        ? replay.isPlaying ? 'playing' : 'paused'
        : 'idle',
    sampleIndex: replay.wrongTurnSampleIndex,
    correlationId: rerouteAttemptsRef.current.current?.id ?? null,
  });
  const latestReplayStateRef = useRef({
    position: replay.position,
    offRouteState: navigation.offRouteState,
    isOffRoute: navigation.isOffRoute,
    lifecycleState: navigation.lifecycleState,
    alertState: navigation.alertState,
    distanceToRouteMeters: navigation.distanceToRoute,
    progressIndex: navigation.progressIndex,
    licenseStatus: navigation.licenseStatus,
    isProEnabled: navigation.isProEnabled,
    rerouteStatus,
    wrongTurnActive: replay.wrongTurnActive,
    wrongTurnSampleIndex: replay.wrongTurnSampleIndex,
    replayScenario: replay.replayScenario,
    sessionKey,
    routeDistanceMeters: route?.distanceMeters ?? null,
    routeGeometryPointCount: route?.geometry.length ?? 0,
  });
  latestReplayStateRef.current = {
    position: replay.position,
    offRouteState: navigation.offRouteState,
    isOffRoute: navigation.isOffRoute,
    lifecycleState: navigation.lifecycleState,
    alertState: navigation.alertState,
    distanceToRouteMeters: navigation.distanceToRoute,
    progressIndex: navigation.progressIndex,
    licenseStatus: navigation.licenseStatus,
    isProEnabled: navigation.isProEnabled,
    rerouteStatus,
    wrongTurnActive: replay.wrongTurnActive,
    wrongTurnSampleIndex: replay.wrongTurnSampleIndex,
    replayScenario: replay.replayScenario,
    sessionKey,
    routeDistanceMeters: route?.distanceMeters ?? null,
    routeGeometryPointCount: route?.geometry.length ?? 0,
  };
  const replayStateKey = JSON.stringify({
    offRouteState: navigation.offRouteState,
    isOffRoute: navigation.isOffRoute,
    lifecycleState: navigation.lifecycleState,
    alertState: navigation.alertState,
    rerouteStatus,
    wrongTurnActive: replay.wrongTurnActive,
    replayScenario: replay.replayScenario,
    sessionKey,
    routeDistanceMeters: route?.distanceMeters ?? null,
    routeGeometryPointCount: route?.geometry.length ?? 0,
  });

  useEffect(() => {
    if (replayDiagnosticsEnabled) {
      console.info(`[navigation-poc] APP_JS_STARTED ${JSON.stringify({ timestamp: appJsStartedAt })}`);
    }
  }, []);

  useEffect(() => {
    if (!replayDiagnosticsEnabled) {
      return;
    }

    if (lastReplayStateLogRef.current === replayStateKey) {
      return;
    }
    lastReplayStateLogRef.current = replayStateKey;

    const snapshot = latestReplayStateRef.current;
    if (
      snapshot.offRouteState === 'DEVIATING' &&
      firstDeviatingAtRef.current === null
    ) {
      firstDeviatingAtRef.current = performance.now();
      logReroutePhase('T0_DEVIATING', {
        correlationId: rerouteAttemptsRef.current?.current?.id ?? null,
        sampleIndex: snapshot.wrongTurnSampleIndex,
        scenario: snapshot.replayScenario,
        offRouteState: snapshot.offRouteState,
        lifecycleState: snapshot.lifecycleState,
        distanceToRouteMeters: Number.isFinite(snapshot.distanceToRouteMeters)
          ? Number(snapshot.distanceToRouteMeters.toFixed(1))
          : null,
      });
    }
    if (
      snapshot.offRouteState === 'OFF_ROUTE' &&
      offRouteConfirmedAtRef.current === null
    ) {
      logReroutePhase('T1_OFF_ROUTE_CONFIRMED', {
        correlationId: rerouteAttemptsRef.current?.current?.id ?? null,
        sampleIndex: snapshot.wrongTurnSampleIndex,
        scenario: snapshot.replayScenario,
        offRouteState: snapshot.offRouteState,
        lifecycleState: snapshot.lifecycleState,
        distanceToRouteMeters: Number.isFinite(snapshot.distanceToRouteMeters)
          ? Number(snapshot.distanceToRouteMeters.toFixed(1))
          : null,
      });
    }
    if (snapshot.isOffRoute && offRouteConfirmedAtRef.current === null) {
      offRouteConfirmedAtRef.current = Date.now();
      console.info(
        `[navigation-poc] PHASE_1_OFF_ROUTE_DETECTED ${JSON.stringify({
          timestamp: offRouteConfirmedAtRef.current,
          elapsedSinceReplayStartMs:
            replayStartTimestampRef.current === null
              ? null
              : offRouteConfirmedAtRef.current - replayStartTimestampRef.current,
          distanceToRouteMeters: Number.isFinite(snapshot.distanceToRouteMeters)
            ? Number(snapshot.distanceToRouteMeters.toFixed(1))
            : null,
          offRouteState: snapshot.offRouteState,
          lifecycleState: snapshot.lifecycleState,
          sampleIndex: snapshot.wrongTurnSampleIndex,
          scenario: snapshot.replayScenario,
        })}`,
      );
    }
    console.info(
      `[navigation-poc] ${snapshot.wrongTurnActive ? 'REPLAY_PUBLIC_STATE' : 'NAVIGATION_PUBLIC_STATE'} ${JSON.stringify({
        timestamp: Date.now(),
        replayElapsedMs:
          !snapshot.wrongTurnActive ||
          replayStartTimestampRef.current === null ||
          snapshot.position === null
            ? null
            : snapshot.position.timestamp - replayStartTimestampRef.current,
        inputTimestamp: snapshot.position?.timestamp ?? null,
        inputSampleIndex: snapshot.wrongTurnSampleIndex,
        offRouteState: snapshot.offRouteState,
        isOffRoute: snapshot.isOffRoute,
        lifecycleState: snapshot.lifecycleState,
        alertState: snapshot.alertState,
        distanceToRouteMeters: Number.isFinite(snapshot.distanceToRouteMeters)
          ? Number(snapshot.distanceToRouteMeters.toFixed(1))
          : null,
        progressIndex: snapshot.progressIndex,
        licenseStatus: snapshot.licenseStatus,
        isProEnabled: snapshot.isProEnabled,
        rerouteStatus: snapshot.rerouteStatus,
        scenario: snapshot.replayScenario,
        sessionKey: snapshot.sessionKey,
        routeDistanceMeters: snapshot.routeDistanceMeters,
        routeGeometryPointCount: snapshot.routeGeometryPointCount,
      })}`,
    );
  }, [replayStateKey, replay.wrongTurnActive]);

  useEffect(() => {
    const sampleIndex = replay.wrongTurnSampleIndex;
    if (
      !replayDiagnosticsEnabled ||
      !replaySampleDiagnosticsEnabled ||
      !replay.wrongTurnActive ||
      sampleIndex === null ||
      lastReplaySampleLogRef.current === sampleIndex
    ) {
      return;
    }

    lastReplaySampleLogRef.current = sampleIndex;
    const state = navigation.engine.getState();
    console.info(
      `[navigation-poc] REPLAY_SAMPLE_STATE ${JSON.stringify({
        timestamp: Date.now(),
        inputTimestamp: replay.position?.timestamp ?? null,
        sampleIndex,
        scenario: replay.replayScenario,
        replayElapsedMs:
          replayStartTimestampRef.current === null || replay.position === null
            ? null
            : replay.position.timestamp - replayStartTimestampRef.current,
        lifecycleState: state.lifecycleState,
        offRouteState: state.offRouteState,
        progressIndex: state.progressIndex,
      })}`,
    );
  }, [
    navigation.engine,
    replay.position,
    replay.replayScenario,
    replay.wrongTurnActive,
    replay.wrongTurnSampleIndex,
  ]);

  useEffect(() => {
    if (replay.wrongTurnActive) {
      return;
    }
    if (
      !route ||
      route !== initialRouteRef.current ||
      initialRouteLoggedRef.current ||
      !replayDiagnosticsEnabled
    ) {
      return;
    }
    initialRouteLoggedRef.current = true;
    console.info(
      `[navigation-poc] INITIAL_ROUTE_READY ${JSON.stringify({
        timestamp: Date.now(),
        elapsedSinceAppJsStartMs: Date.now() - appJsStartedAt,
        routeDistanceMeters: route.distanceMeters,
        routeGeometryPointCount: route.geometry.length,
      })}`,
    );
  }, [replay.wrongTurnActive, route]);

  useEffect(() => {
    if (pendingReplayStartSessionKeyRef.current !== sessionKey) {
      return;
    }

    pendingReplayStartSessionKeyRef.current = null;
    const scenario = pendingReplayScenarioRef.current;
    pendingReplayScenarioRef.current = 'wrong-turn';
    const scenarioLabel =
      scenario === 'missed-turn-straight'
        ? 'Missed turn, straight on replay'
        : scenario === 'missed-turn-straight-stall'
          ? 'Missed turn, straight on replay (3s stall)'
          : replay.scenarioLabel;
    const inputSource =
      scenario === 'missed-turn-straight' || scenario === 'missed-turn-straight-stall'
        ? 'saved Valhalla fixture; labeled replay scenario'
        : replay.inputSource;
    const atomicStartRequestedAt = Date.now();
    if (replayDiagnosticsEnabled) {
      console.info(
        `[navigation-poc] ATOMIC_SESSION_START_REQUESTED ${JSON.stringify({
          timestamp: atomicStartRequestedAt,
          sessionKey,
        })}`,
      );
    }
    if (!replay.position) {
      console.error('[navigation-poc] Cannot start replay: no initial route position is available.');
      return;
    }

    void startAtomicSession(replay.position).then(
      (state) => {
        if (sessionKey !== latestSessionKeyRef.current) {
          return;
        }
        const readyAt = Date.now();
        if (replayDiagnosticsEnabled) {
          console.info(
            `[navigation-poc] ATOMIC_SESSION_ON_ROUTE ${JSON.stringify({
              timestamp: readyAt,
              sessionKey,
              durationMs: readyAt - atomicStartRequestedAt,
              lifecycleState: state.lifecycleState,
              offRouteState: state.offRouteState,
              progressIndex: state.progressIndex,
            })}`,
          );
        }
        replayStartTimestampRef.current = readyAt;
        offRouteConfirmedAtRef.current = null;
        firstDeviatingAtRef.current = null;
        setReplayResetting(false);
        lastReplaySampleLogRef.current = null;
        if (replayDiagnosticsEnabled) {
          console.info(
            `[navigation-poc] REPLAY_START_REQUESTED ${JSON.stringify({
              timestamp: replayStartTimestampRef.current,
              sessionKey,
              scenario,
              inputSource,
            })}`,
          );
        }
        console.info(
          `[navigation-poc] Replay scenario started: ${scenarioLabel}`,
        );
        startWrongTurnReplayRef.current(scenario);
      },
      (error: unknown) => {
        setReplayResetting(false);
        console.error(
          '[navigation-poc] Atomic navigation session failed before the replay started.',
          error,
        );
      },
    );
  }, [
    replay.inputSource,
    replay.position,
    replay.scenarioLabel,
    sessionKey,
    startAtomicSession,
  ]);

  useEffect(() => {
    const requestedAt = Date.now();
    if (replayDiagnosticsEnabled) {
      console.info(
        `[navigation-poc] INITIAL_ROUTE_REQUEST_STARTED ${JSON.stringify({
          timestamp: requestedAt,
          elapsedSinceAppJsStartMs: requestedAt - appJsStartedAt,
        })}`,
      );
    }
    const controller = new AbortController();
    void provider
      .route({
        origin: routeOrigin,
        destination: demoTrip.destination,
        signal: controller.signal,
      })
      .then((loadedRoute) => {
        if (!initialRouteRef.current) {
          initialRouteRef.current = loadedRoute;
        }
        setRoute(loadedRoute);
        setRouteError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof RoutingError && error.kind === 'cancelled') {
          return;
        }
        setRouteError(error instanceof Error ? error.message : 'Route loading failed.');
      });

    return () => controller.abort();
  }, [routeOrigin, routeRetryCount]);

  useEffect(() => {
    latestPosition.current = activePosition;
    const raw = activePosition?.coordinate;
    const snapped = navigation.snappedCoord;
    if (raw) {
      setRawTrail((trail) => appendTrailPoint(trail, raw));
      const isOutsideRoute =
        navigation.offRouteState === 'DEVIATING' || navigation.isOffRoute;
      if (isOutsideRoute) {
        setDeviationTrail((trail) => {
          // Include the last on-route point once, making the red line begin
          // at the route rather than at the first already-diverged fix.
          const startingTrail =
            trail.length === 0 && previousRawPositionRef.current
              ? [previousRawPositionRef.current]
              : trail;
          return appendTrailPoint(startingTrail, raw);
        });
      }
      previousRawPositionRef.current = raw;
    }
    if (snapped) {
      setSnappedTrail((trail) => appendTrailPoint(trail, snapped));
    }
  }, [activePosition, navigation.snappedCoord]);

  const liveSessionRouteRef = useRef<NeutralRoute | null>(null);
  useEffect(() => {
    if (
      positionSource !== 'gps' ||
      !route ||
      !liveLocation.position ||
      liveLocation.status !== 'tracking' ||
      liveSessionRouteRef.current === route
    ) {
      return;
    }
    liveSessionRouteRef.current = route;
    void startAtomicSession(liveLocation.position).catch((error: unknown) => {
      liveSessionRouteRef.current = null;
      console.error('[navigation-poc] Foreground GPS navigation could not start.', error);
    });
  }, [liveLocation.position, liveLocation.status, positionSource, route, startAtomicSession]);

  const requestReroute = useCallback(async () => {
    const currentPosition = latestPosition.current;
    const currentRoute = route;
    const coordinator = rerouteAttemptsRef.current;
    if (!currentPosition || !currentRoute || !coordinator) {
      return;
    }

    const attempt = coordinator.begin();
    if (!attempt) {
      return;
    }
    const startedAt = performance.now();
    setRerouteStatus('requested');
    logReroutePhase('T2_REROUTE_REQUEST_SENT', {
      correlationId: attempt.id,
      sampleIndex: latestReplayStateRef.current.wrongTurnSampleIndex,
      scenario: replay.replayScenario,
    });

    try {
      const nextRoute = await requestFreshReroute({
        provider,
        destination: lastCoordinate(currentRoute),
        getCurrentPosition: () => latestPosition.current,
        signal: attempt.controller.signal,
        onRequest: (attempt, position) => {
          if (replayDiagnosticsEnabled) {
            console.info(
              `[navigation-poc] REROUTE_ATTEMPT_STARTED ${JSON.stringify({
                wallClockTimestamp: new Date().toISOString(),
                monotonicTimestampMs: performance.now(),
                retryAttempt: attempt,
                origin: position.coordinate,
                scenario: replay.replayScenario,
              })}`,
            );
          }
        },
        onResponseReceived: (retryAttempt) => {
          logReroutePhase('T3_RESPONSE_RECEIVED', {
            correlationId: attempt.id,
            retryAttempt,
            scenario: replay.replayScenario,
          });
        },
        onRouteDecoded: (retryAttempt, decodedRoute) => {
          logReroutePhase('T4_ROUTE_DECODED_NORMALIZED', {
            correlationId: attempt.id,
            retryAttempt,
            routeDistanceMeters: decodedRoute.distanceMeters,
            routeGeometryPointCount: decodedRoute.geometry.length,
            scenario: replay.replayScenario,
          });
        },
        onDiscard: (attempt, distanceMeters) => {
          console.warn(
            `[navigation-poc] Discarded stale reroute response ${JSON.stringify({
              retryAttempt: attempt,
              distanceFromCurrentPositionMeters: Number(distanceMeters.toFixed(1)),
              boundedRetryLimit: 2,
            })}`,
          );
        },
      });
      if (!coordinator.isCurrent(attempt)) {
        return;
      }
      const duration = performance.now() - startedAt;
      rerouteResponseAtRef.current = Date.now();
      setRerouteDurationMs(duration);
      setRerouteStatus('received');
      if (replayDiagnosticsEnabled) {
        console.info(
          `[navigation-poc] PHASE_3_REROUTE_RESPONSE_RECEIVED ${JSON.stringify({
            timestamp: rerouteResponseAtRef.current,
            requestDurationMs: duration,
            newRouteDistanceMeters: nextRoute.distanceMeters,
            newRouteGeometryPointCount: nextRoute.geometry.length,
            scenario: replay.replayScenario,
          })}`,
        );
      }
      const positionAtResponse = latestPosition.current;
      if (!positionAtResponse) {
        throw new RoutingError('invalid_response', 'Cannot apply the reroute without a current position.');
      }
      const instructions = nextRoute.instructions.map((instruction) => ({
        location: instruction.coordinate,
        geometryIndex: instruction.geometryIndex,
        text: instruction.text,
      }));
      navigation.engine.setRoute(nextRoute.geometry, instructions);
      logReroutePhase('T5_ROUTE_APPLIED_TO_ENGINE', {
        correlationId: attempt.id,
        scenario: replay.replayScenario,
        routeDistanceMeters: nextRoute.distanceMeters,
        routeGeometryPointCount: nextRoute.geometry.length,
      });
      pendingRenderedRerouteRef.current = {
        route: nextRoute,
        scenario: replay.replayScenario,
        attemptId: attempt.id,
        previousRoute: currentRoute,
        initialLocation: positionAtResponse,
      };
      cancelRouteRenderDeadlineRef.current();
      cancelRouteRenderDeadlineRef.current = createAttemptDeadline(
        routeRenderTimeoutMs,
        () => {
          const pending = pendingRenderedRerouteRef.current;
          if (!pending || pending.attemptId !== attempt.id) {
            return;
          }
          pendingRenderedRerouteRef.current = null;
          coordinator.cancel();
          navigation.engine.setRoute(
            currentRoute.geometry,
            currentRoute.instructions.map((instruction) => ({
              location: instruction.coordinate,
              geometryIndex: instruction.geometryIndex,
              text: instruction.text,
            })),
          );
          setRoute(currentRoute);
          void startAtomicSessionFor(currentRoute, positionAtResponse).catch((restoreError: unknown) => {
            console.error(
              '[navigation-poc] The last valid route could not be restored after a render timeout.',
              restoreError,
            );
          });
          logReroutePhase('REROUTE_APPLY_FAILED', {
            correlationId: attempt.id,
            reason: 'Rendered route was not observed before the app deadline.',
            lastValidRouteKept: true,
            timeoutMs: routeRenderTimeoutMs,
          });
          setRerouteStatus('failed');
        },
      );
      setRerouteStatus('applying');
      setRoute(nextRoute);
      setRawTrail([]);
      setSnappedTrail([]);
      // Do not clear deviationTrail here: it is the visual evidence of the
      // transition from the previous route to this current-position reroute.
    } catch (error) {
      if (error instanceof RoutingError && error.kind === 'cancelled') {
        return;
      }
      console.error('[navigation-poc] Valhalla reroute request failed.', error);
      setRerouteStatus('failed');
      coordinator.complete(attempt);
    } finally {
      if (!coordinator.isCurrent(attempt) && coordinator.current === attempt) {
        coordinator.complete(attempt);
      }
    }
  }, [
    navigation.engine,
    replay.replayScenario,
    route,
    startAtomicSessionFor,
  ]);

  const handleRouteRendered = useCallback((renderedRoute: NeutralRoute) => {
    const pending = pendingRenderedRerouteRef.current;
    const coordinator = rerouteAttemptsRef.current;
    const attempt = coordinator?.current;
    if (
      !pending ||
      pending.route !== renderedRoute ||
      !attempt ||
      attempt.id !== pending.attemptId
    ) {
      return;
    }

    pendingRenderedRerouteRef.current = null;
    cancelRouteRenderDeadlineRef.current();
    cancelRouteRenderDeadlineRef.current = () => {};
    const renderedAt = performance.now();
    logReroutePhase('T6_ROUTE_VISIBLE_ON_MAP', {
      correlationId: attempt.id,
      scenario: pending.scenario,
      routeDistanceMeters: renderedRoute.distanceMeters,
      routeGeometryPointCount: renderedRoute.geometry.length,
      offRouteState: latestReplayStateRef.current.offRouteState,
      lifecycleState: latestReplayStateRef.current.lifecycleState,
    });
    setRerouteStatus('resuming');

    void startAtomicSessionFor(renderedRoute, pending.initialLocation).then(
      (state) => {
        if (!coordinator?.isCurrent(attempt)) {
          return;
        }
        logReroutePhase('T7_GUIDANCE_RESUMED', {
          correlationId: attempt.id,
          scenario: pending.scenario,
          lifecycleState: state.lifecycleState,
          offRouteState: state.offRouteState,
          progressIndex: state.progressIndex,
          renderToOnRouteMs: performance.now() - renderedAt,
        });
        coordinator.complete(attempt);
        setRerouteStatus('idle');
      },
      (error: unknown) => {
        if (!coordinator?.isCurrent(attempt)) {
          return;
        }
        console.error('[navigation-poc] Navigation did not resume on the rendered reroute route.', error);
        const previousInstructions = pending.previousRoute.instructions.map((instruction) => ({
          location: instruction.coordinate,
          geometryIndex: instruction.geometryIndex,
          text: instruction.text,
        }));
        try {
          navigation.engine.setRoute(pending.previousRoute.geometry, previousInstructions);
          setRoute(pending.previousRoute);
          void startAtomicSessionFor(pending.previousRoute, pending.initialLocation).catch(
            (restoreError: unknown) => {
              console.error('[navigation-poc] The last valid route could not be restored to navigation.', restoreError);
            },
          );
        } catch (restoreError) {
          console.error('[navigation-poc] The last valid route could not be restored to navigation.', restoreError);
        }
        logReroutePhase('REROUTE_APPLY_FAILED', {
          correlationId: attempt.id,
          reason: error instanceof Error ? error.message : 'Navigation startup failed.',
          lastValidRouteKept: true,
        });
        coordinator.complete(attempt);
        setRerouteStatus('failed');
      },
    );
  }, [navigation.engine, startAtomicSessionFor]);

  const lastRouteRef = useRef<NeutralRoute | null>(null);
  useEffect(() => {
    const previousRoute = lastRouteRef.current;
    if (previousRoute && route !== previousRoute) {
      const pending = pendingRenderedRerouteRef.current;
      if (pending?.route !== route) {
        const cancelled = rerouteAttemptsRef.current?.cancel();
        cancelRouteRenderDeadlineRef.current();
        cancelRouteRenderDeadlineRef.current = () => {};
        if (cancelled) {
          logReroutePhase('REROUTE_CANCELLED', {
            correlationId: cancelled.id,
            reason: 'route-replaced-by-another-operation',
          });
        }
      }
    }
    lastRouteRef.current = route;
  }, [route]);

  const clearOffRouteReroute = useCallback(() => {
    const active = rerouteAttemptsRef.current?.current;
    if (active && (rerouteStatus === 'requested' || rerouteStatus === 'received')) {
      rerouteAttemptsRef.current?.cancel();
      pendingRenderedRerouteRef.current = null;
      logReroutePhase('REROUTE_CANCELLED', {
        correlationId: active.id,
        reason: 'navigation-rejoined',
      });
      setRerouteStatus('idle');
    } else if (rerouteStatus === 'failed') {
      setRerouteStatus('idle');
    }
  }, [rerouteStatus]);
  const markOffRouteReroutePending = useCallback(() => {
    setRerouteStatus('requested');
  }, []);

  useRerouteOnOffRoute(
    isOffRoute,
    Boolean(route && latestPosition.current),
    requestReroute,
    clearOffRouteReroute,
    markOffRouteReroutePending,
  );

  useEffect(() => () => {
    cancelRouteRenderDeadlineRef.current();
    const active = rerouteAttemptsRef.current?.cancel();
    if (active) {
      logReroutePhase('REROUTE_CANCELLED', {
        correlationId: active.id,
        reason: 'component-unmounted',
      });
    }
  }, []);

  const handleRestart = useCallback(() => {
    cancelRouteRenderDeadlineRef.current();
    cancelRouteRenderDeadlineRef.current = () => {};
    const cancelledAttempt = rerouteAttemptsRef.current?.cancel();
    if (cancelledAttempt) {
      logReroutePhase('REROUTE_CANCELLED', {
        correlationId: cancelledAttempt.id,
        reason: 'replay-reset',
      });
    }
    pendingReplayStartSessionKeyRef.current = null;
    pendingRenderedRerouteRef.current = null;
    offRouteConfirmedAtRef.current = null;
    firstDeviatingAtRef.current = null;
    lastReplaySampleLogRef.current = null;
    if (replayDiagnosticsEnabled) {
      console.info(
        `[navigation-poc] REPLAY_RESET_REQUESTED ${JSON.stringify({
          timestamp: Date.now(),
          sessionKey,
          nextSessionKey: sessionKey + 1,
        })}`,
      );
    }
    setRerouteStatus('idle');
    setReplayResetting(false);
    setRerouteDurationMs(null);
    setRawTrail([]);
    setSnappedTrail([]);
    setDeviationTrail([]);
    setSimulatedDeviationPath([]);
    previousRawPositionRef.current = null;

    const originalRoute = initialRouteRef.current;
    if (originalRoute) {
      setRoute(originalRoute);
    }

    replay.restartRoute();
    liveLocation.stop();
    liveSessionRouteRef.current = null;
    setPositionSource('replay');
    setRouteOrigin(demoTrip.origin);
    setSessionKey((prev) => prev + 1);
    console.info('[navigation-poc] Route, replay, and navigation state reset');
  }, [liveLocation, replay, sessionKey]);

  const handleStartLiveGps = useCallback(() => {
    cancelRouteRenderDeadlineRef.current();
    cancelRouteRenderDeadlineRef.current = () => {};
    rerouteAttemptsRef.current?.cancel();
    replay.restartRoute();
    setReplayResetting(false);
    setRerouteStatus('idle');
    setRouteError(null);
    void liveLocation.start().then(
      (initialPosition) => {
        liveSessionRouteRef.current = null;
        latestPosition.current = initialPosition;
        setPositionSource('gps');
        setRouteOrigin(initialPosition.coordinate);
        setRawTrail([initialPosition.coordinate]);
        setSnappedTrail([]);
        setDeviationTrail([]);
        setSimulatedDeviationPath([]);
        previousRawPositionRef.current = initialPosition.coordinate;
        setRoute(null);
      },
      (error: unknown) => {
        setRouteError(error instanceof Error ? error.message : 'Foreground GPS could not be started.');
      },
    );
  }, [liveLocation, replay]);

  const handleStopLiveGps = useCallback(() => {
    liveLocation.stop();
    liveSessionRouteRef.current = null;
    setPositionSource('replay');
    setRerouteStatus('idle');
    console.info('[navigation-poc] Foreground GPS tracking stopped.');
  }, [liveLocation]);

  const handleReplayScenario = useCallback((scenario: 'wrong-turn' | 'missed-turn-straight' | 'missed-turn-straight-stall') => {
    handleRestart();
    setReplayResetting(true);
    pendingReplayScenarioRef.current = scenario;
    pendingReplayStartSessionKeyRef.current = sessionKey + 1;
    if (replayDiagnosticsEnabled) {
      console.info(
        `[navigation-poc] REPLAY_START_WAITING_FOR_SESSION_RESET ${JSON.stringify({
          timestamp: Date.now(),
          sessionKey: sessionKey + 1,
          scenario,
        })}`,
      );
    }
  }, [handleRestart, sessionKey]);
  const handleDeviationFromCurrentPosition = useCallback(() => {
    const startingPosition = latestPosition.current ?? activePosition;
    if (!route || !startingPosition || navigation.lifecycleState !== 'ON_ROUTE') {
      console.warn('[navigation-poc] A current on-route vehicle position is required before simulating a deviation.');
      return;
    }
    if (replay.deviationScenarioActive || rerouteAttemptsRef.current?.current) {
      return;
    }

    // Crucially, this does not reset the route, navigation engine, or replay
    // progress. The generated GPS trace begins at the vehicle location at the
    // instant of the click and NavCore decides when it is off route.
    const path = replay.startDeviationFromCurrentPosition(startingPosition);
    setSimulatedDeviationPath(path);
    setDeviationTrail([]);
    previousRawPositionRef.current = startingPosition.coordinate;
    setRerouteDurationMs(null);
    console.info(`[navigation-poc] CURRENT_POSITION_DEVIATION_STARTED ${JSON.stringify({
      origin: startingPosition.coordinate,
      destination: lastCoordinate(route),
      confirmationWindowMs: 2_000,
      samples: path.length,
    })}`);
  }, [activePosition, navigation.lifecycleState, replay, route]);

  const autoStartDoneRef = useRef(false);
  useEffect(() => {
    if (!route || autoStartDoneRef.current || navigation.lifecycleState !== 'ON_ROUTE') return;
    const autoScenario = process.env.EXPO_PUBLIC_NAVCORE_AUTO_SCENARIO;
    if (autoScenario === 'missed-turn-straight' || autoScenario === 'missed-turn-straight-stall' || autoScenario === 'wrong-turn') {
      autoStartDoneRef.current = true;
      console.info(`[navigation-poc] AUTO_START_TRIGGERED ${JSON.stringify({ scenario: autoScenario })}`);
      handleReplayScenario(autoScenario);
    }
  }, [route, navigation.lifecycleState, handleReplayScenario]);

  const progress = useMemo(
    () => (route ? routeProgress(route, navigation.progressIndex) : null),
    [navigation.progressIndex, route],
  );
  const instructionState = useMemo(() => {
    if (!route) {
      return { current: null, next: null, metersToNext: 0 };
    }
    const currentIndex = route.instructions.reduce(
      (lastIndex, instruction, index) =>
        instruction.geometryIndex <= navigation.progressIndex ? index : lastIndex,
      -1,
    );
    const current = currentIndex >= 0 ? route.instructions[currentIndex] : null;
    const next = route.instructions[currentIndex + 1] ?? null;
    const metersToNext =
      next && navigation.snappedCoord
        ? distanceBetween(navigation.snappedCoord, next.coordinate)
        : next
          ? distanceBetween(route.geometry[navigation.progressIndex] ?? route.geometry[0], next.coordinate)
          : 0;
    return { current, next, metersToNext };
  }, [navigation.progressIndex, navigation.snappedCoord, route]);

  if (!route) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#2563eb" size="large" />
        <Text style={styles.loadingText}>{routeError ?? 'Loading navigation route...'}</Text>
        {routeError ? (
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              setRouteError(null);
              setRouteRetryCount((count) => count + 1);
            }}
          >
            <Text style={styles.buttonText}>Retry route request</Text>
          </Pressable>
        ) : null}
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <GuidanceMap
        route={route}
        rawGpsPosition={activePosition}
        corePosition={navigation.ghostCoord}
        proSnappedPosition={navigation.snappedCoord}
        bearing={navigation.bearing}
        rawTrail={rawTrail}
        snappedTrail={snappedTrail}
        deviationTrail={deviationTrail}
        simulatedDeviationPath={simulatedDeviationPath}
        alertState={navigation.alertState}
        isOffRoute={isOffRoute}
        isDeviationScenarioActive={replay.deviationScenarioActive}
        distanceToRoute={navigation.distanceToRoute}
        corridor={navigation.corridor}
        onRouteRendered={handleRouteRendered}
      />
      <View style={styles.topCard}>
        <Text style={styles.eyebrow}>NAVIGATION POC · {routingMode.toUpperCase()}</Text>
        {positionSource === 'gps' ? (
          <Text style={styles.scenarioLabel}>LIVE FOREGROUND GPS</Text>
        ) : replay.deviationScenarioActive ? (
          <Text style={styles.scenarioLabel}>SIMULATED DEVIATION · STARTED FROM CURRENT POSITION</Text>
        ) : replay.wrongTurnActive ? (
          <Text style={styles.scenarioLabel}>
            {`REPLAY SCENARIO · ${replay.scenarioLabel.toUpperCase()}`}
          </Text>
        ) : null}
        <Text style={styles.instruction} numberOfLines={2}>
          {rerouteStatus === 'idle' && navigation.lifecycleState === 'ON_ROUTE'
            ? instructionState.next?.text ?? 'Route active'
            : viewModel.bannerMessage}
        </Text>
        <Text style={styles.subInstruction}>
          {rerouteStatus === 'idle' && navigation.lifecycleState === 'ON_ROUTE'
            ? `${instructionState.current ? `Current: ${instructionState.current.text}` : 'Preparing guidance'}${
                instructionState.next ? `  ·  In ${formatDistance(instructionState.metersToNext)}` : ''
              }`
            : `Lifecycle ${navigation.lifecycleState} · off-route ${navigation.offRouteState}`}
        </Text>
        <View
          style={[
            styles.stateBanner,
            viewModel.bannerTone === 'danger'
              ? styles.stateBannerDanger
              : viewModel.bannerTone === 'warning'
                ? styles.stateBannerWarning
                : viewModel.bannerTone === 'success'
                  ? styles.stateBannerSuccess
                  : styles.stateBannerInfo,
          ]}
        >
          <Text style={styles.stateBannerText}>{viewModel.bannerMessage}</Text>
          {viewModel.isOffRoute ? (
            <Text style={styles.stateBannerDistance}>
              {formatDistance(navigation.distanceToRoute)} from route
            </Text>
          ) : null}
        </View>
        <NavigationHudState
          lifecycleState={navigation.lifecycleState}
          offRouteState={navigation.offRouteState}
          rerouteStatus={rerouteStatus}
        />
      </View>
      <View style={styles.bottomCard}>
        {/* 3-Position Legend: Clearly Distinguishable */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>RAW (NO SDK)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#8b5cf6' }]} />
            <Text style={styles.legendText}>CORE (FILTERED)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#059669' }]} />
            <Text style={styles.legendText}>PRO (SNAPPED)</Text>
          </View>
          <Text style={styles.deviationDistanceText}>
            {`${formatDistance(navigation.distanceToRoute)} off`}
          </Text>
          {deviationTrail.length > 1 ? (
            <Text style={styles.deviationTraceText}>DEVIATION TRACE</Text>
          ) : null}
          <Text style={styles.progressText}>{Math.round(progress?.percent ?? 0)}%</Text>
        </View>

        {/* Controls */}
        <View style={styles.controlRow}>
          <Pressable
            style={positionSource === 'gps' ? styles.restartButton : styles.primaryButton}
            onPress={positionSource === 'gps' ? handleStopLiveGps : handleStartLiveGps}
            accessibilityLabel={positionSource === 'gps' ? 'Stop live GPS navigation' : 'Start live GPS navigation'}
          >
            <Text style={positionSource === 'gps' ? styles.restartButtonText : styles.buttonText}>
              {positionSource === 'gps' ? 'Stop live GPS' : 'Start live GPS'}
            </Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={replay.togglePlayback}>
            <Text style={styles.buttonText}>{replay.isPlaying ? 'Pause' : 'Resume'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={replay.cycleSpeed}>
            <Text style={styles.secondaryButtonText}>{replay.speedMultiplier}x</Text>
          </Pressable>
          <Pressable
            style={[
              styles.deviateButton,
              replay.deviationScenarioActive ? styles.deviateButtonActive : null,
            ]}
            onPress={handleDeviationFromCurrentPosition}
            disabled={replay.deviationScenarioActive || rerouteStatus !== 'idle'}
            testID="deviation-from-current-position"
            accessibilityLabel="Simulate a route deviation from the current vehicle position"
          >
            <Text style={styles.deviateButtonText}>
              {replay.deviationScenarioActive ? 'Deviation in progress' : 'Simulate deviation here'}
            </Text>
          </Pressable>
          <Pressable style={styles.restartButton} onPress={handleRestart}>
            <Text style={styles.restartButtonText}>Reset All</Text>
          </Pressable>
        </View>
        {replay.deviationScenarioActive ? (
          <Text style={styles.deviationExplanation}>
            Vehicle follows the dashed path · outside corridor → 2 s confirmation → reroute from GPS
          </Text>
        ) : null}

        {rerouteStatus === 'failed' ? (
          <Pressable onPress={() => void requestReroute()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry reroute</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setDiagnosticsExpanded((expanded) => !expanded)}
          style={styles.diagnosticsToggle}
          accessibilityLabel={diagnosticsExpanded ? 'Collapse navigation diagnostics' : 'Expand navigation diagnostics'}
        >
          <Text style={styles.diagnosticsToggleText}>
            {diagnosticsExpanded ? 'Diagnostics  ▲  Collapse' : 'Diagnostics  ▼  Show'}
          </Text>
        </Pressable>

        {diagnosticsExpanded ? (
          <View style={styles.diagnostics}>
            <View style={styles.diagnosticsHeader}>
              <Text style={styles.diagnosticsTitle}>LIVE NAVIGATION DIAGNOSTICS</Text>
              <Pressable
                onPress={() => setDiagnosticsExpanded(false)}
                style={styles.diagnosticsCollapseButton}
                accessibilityLabel="Collapse navigation diagnostics"
              >
                <Text style={styles.diagnosticsCollapseText}>Hide ▲</Text>
              </Pressable>
            </View>
            <Text style={styles.diagnosticsHint}>
              Public NavCore state, GPS input, corridor and routing lifecycle.
            </Text>
            <Diagnostic label="Navigation state" value={`${viewModel.lifecycleState} · ${viewModel.offRouteState}`} important />
            <Diagnostic label="Reroute state" value={viewModel.rerouteStatus} important />
            <Diagnostic
              label="Position source"
              value={
                positionSource === 'gps'
                  ? 'Foreground device GPS'
                  : replay.wrongTurnActive
                  ? replay.inputSource
                  : 'Normal route replay'
              }
            />
            <Diagnostic label="Route provider" value={routingMode === 'valhalla' ? 'Valhalla (local)' : 'Fixture provider'} />
            <Diagnostic
              label="Corridor decision"
              value={navigation.distanceToRoute > navigation.corridor ? 'OUTSIDE' : 'INSIDE'}
            />
            <Diagnostic label="Distance / corridor" value={`${formatDistance(navigation.distanceToRoute)} / ${formatDistance(navigation.corridor)}`} />
            <Diagnostic
              label="NavCore license"
              value={`${navigation.licenseStatus}${navigation.isProEnabled ? ' · Pro active' : ''}`}
            />
            <Diagnostic label="Location accuracy" value={activePosition ? `${activePosition.accuracyMeters.toFixed(1)} m` : '--'} />
            <Diagnostic label="GPS speed" value={activePosition ? `${(activePosition.speedMetersPerSecond * 3.6).toFixed(1)} km/h` : '--'} />
            <Diagnostic label="Route progress" value={`${formatDistance(progress?.distanceMeters ?? 0)} / ${formatDistance(route.distanceMeters)}`} />
          </View>
        ) : null}
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function NavigationHudState({
  lifecycleState,
  offRouteState,
  rerouteStatus,
}: {
  lifecycleState: string;
  offRouteState: string;
  rerouteStatus: RerouteStatus;
}) {
  const isChecking = offRouteState === 'DEVIATING';
  const isOffRoute = offRouteState === 'OFF_ROUTE';
  const isRerouting = rerouteStatus !== 'idle';
  const state = isRerouting
    ? `RECALCULATING · ${rerouteStatus.toUpperCase()}`
    : isOffRoute
      ? 'OFF ROUTE · CONFIRMED'
      : isChecking
        ? 'DEVIATION · CONFIRMING FOR 2 s'
        : lifecycleState.replaceAll('_', ' ');
  const tone = isOffRoute ? 'red' : isChecking ? 'amber' : isRerouting ? 'blue' : 'green';
  const toneStyle =
    tone === 'red'
      ? styles.navigationHudRed
      : tone === 'amber'
        ? styles.navigationHudAmber
        : tone === 'blue'
          ? styles.navigationHudBlue
          : styles.navigationHudGreen;
  return (
    <View style={styles.fsmPanel}>
      <Text style={styles.fsmCaption}>NAVIGATION</Text>
      <View style={[styles.navigationHudState, toneStyle]}>
        <Text style={styles.navigationHudValue}>{state}</Text>
      </View>
    </View>
  );
}

function Diagnostic({ label, value, important = false }: { label: string; value: string; important?: boolean }) {
  return (
    <View style={styles.diagnosticRow}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={[styles.diagnosticValue, important ? styles.diagnosticValueImportant : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#e8eef5' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  loadingText: { color: '#334155', textAlign: 'center' },
  topCard: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  eyebrow: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  scenarioLabel: { color: '#92400e', fontSize: 11, fontWeight: '800', marginTop: 6 },
  instruction: { color: '#0f172a', fontSize: 20, fontWeight: '700', marginTop: 6 },
  subInstruction: { color: '#475569', fontSize: 12, marginTop: 6 },
  stateBanner: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  stateBannerInfo: {
    backgroundColor: '#dbeafe',
    borderColor: '#60a5fa',
  },
  stateBannerSuccess: {
    backgroundColor: '#dcfce7',
    borderColor: '#4ade80',
  },
  stateBannerWarning: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  stateBannerDanger: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  stateBannerText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  stateBannerDistance: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  fsmPanel: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#cbd5e1',
  },
  fsmCaption: { color: '#64748b', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  navigationHudState: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  navigationHudGreen: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  navigationHudAmber: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  navigationHudRed: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  navigationHudBlue: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  navigationHudValue: { color: '#0f172a', fontSize: 11, fontWeight: '800', letterSpacing: 0.15 },
  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.96)',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: '#cbd5e1', fontSize: 10, fontWeight: '700' },
  deviationDistanceText: { color: '#fbbf24', fontSize: 10, fontWeight: '700' },
  deviationTraceText: { color: '#f87171', fontSize: 10, fontWeight: '800' },
  progressText: { color: '#fff', fontSize: 11, fontWeight: '800', marginLeft: 'auto' },
  controlRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  deviationExplanation: { color: '#fecaca', fontSize: 11, fontWeight: '600', marginTop: 9 },
  primaryButton: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  secondaryButton: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12 },
  secondaryButtonText: { color: '#e2e8f0', fontWeight: '700', fontSize: 12 },
  deviateButton: {
    backgroundColor: '#d97706',
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 12,
  },
  deviateButtonActive: {
    backgroundColor: '#dc2626',
  },
  deviateButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  restartButton: {
    backgroundColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  restartButtonText: {
    color: '#f1f5f9',
    fontWeight: '700',
    fontSize: 12,
  },
  retryButton: { paddingTop: 10 },
  retryText: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  diagnosticsToggle: { marginTop: 12, alignSelf: 'stretch', borderRadius: 9, borderWidth: 1, borderColor: '#475569', paddingHorizontal: 10, paddingVertical: 9 },
  diagnosticsToggleText: { color: '#e2e8f0', fontWeight: '800', fontSize: 12, textAlign: 'center' },
  diagnostics: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#475569', marginTop: 10, paddingTop: 10, gap: 7 },
  diagnosticsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  diagnosticsTitle: { color: '#f8fafc', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  diagnosticsHint: { color: '#94a3b8', fontSize: 10, lineHeight: 14, marginBottom: 3 },
  diagnosticsCollapseButton: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#334155' },
  diagnosticsCollapseText: { color: '#e2e8f0', fontSize: 10, fontWeight: '800' },
  diagnosticRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  diagnosticLabel: { color: '#94a3b8', fontSize: 11 },
  diagnosticValue: { color: '#f8fafc', fontSize: 11, fontWeight: '600', maxWidth: '55%' },
  diagnosticValueImportant: { color: '#fbbf24', fontWeight: '800' },
});
