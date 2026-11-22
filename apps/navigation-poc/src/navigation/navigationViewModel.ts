import { useEffect, useRef, useState } from 'react';
import type { NavLifecycleState, OffRouteState } from '@ingissa/navcore-core';

export type RerouteStatus =
  | 'idle'
  | 'requested'
  | 'received'
  | 'applying'
  | 'resuming'
  | 'failed';

export type ReplayStatus = 'idle' | 'resetting' | 'playing' | 'paused';
export type NavigationBannerTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export interface NavigationViewModelInput {
  lifecycleState: string;
  offRouteState: string;
  isOffRoute: boolean;
  rerouteStatus: RerouteStatus;
  replayStatus: ReplayStatus;
}

export interface NavigationViewModel {
  lifecycleState: NavLifecycleState;
  offRouteState: OffRouteState;
  isOffRoute: boolean;
  rerouteStatus: RerouteStatus;
  replayStatus: ReplayStatus;
  bannerMessage: string;
  bannerTone: NavigationBannerTone;
}

interface NavigationStateSnapshot {
  lifecycleState: NavLifecycleState;
  offRouteState: OffRouteState;
}

export interface NavigationStateTransitionEvent {
  eventType: 'navigation-state-transition';
  dimension: 'lifecycleState' | 'offRouteState';
  monotonicTimestampMs: number;
  wallClockTimestamp: string;
  sampleIndex: number | null;
  correlationId: string | null;
  before: NavigationStateSnapshot;
  after: NavigationStateSnapshot;
}

const lifecycleStates: readonly NavLifecycleState[] = [
  'IDLE',
  'OVERVIEW',
  'APPROACHING_ROUTE',
  'ON_ROUTE',
];

const offRouteStates: readonly OffRouteState[] = [
  'ON_ROUTE',
  'DEVIATING',
  'OFF_ROUTE',
  'REROUTING',
  'REJOINING',
  'REJOINED',
  'FAILED',
];

function isLifecycleState(value: string): value is NavLifecycleState {
  return lifecycleStates.some((state) => state === value);
}

function isOffRouteState(value: string): value is OffRouteState {
  return offRouteStates.some((state) => state === value);
}

function validateInput(input: NavigationViewModelInput): NavigationStateSnapshot {
  if (!isLifecycleState(input.lifecycleState)) {
    throw new Error(`Unknown public navigation lifecycle state: ${input.lifecycleState}`);
  }
  if (!isOffRouteState(input.offRouteState)) {
    throw new Error(`Unknown public off-route state: ${input.offRouteState}`);
  }
  return {
    lifecycleState: input.lifecycleState,
    offRouteState: input.offRouteState,
  };
}

export function buildNavigationViewModel(
  input: NavigationViewModelInput,
): NavigationViewModel {
  const states = validateInput(input);
  let bannerMessage: string;
  let bannerTone: NavigationBannerTone;

  if (input.replayStatus === 'resetting') {
    bannerMessage = 'Resetting navigation';
    bannerTone = 'info';
  } else if (input.rerouteStatus === 'failed' || states.offRouteState === 'FAILED') {
    bannerMessage = 'Reroute failed';
    bannerTone = 'danger';
  } else if (input.rerouteStatus === 'requested') {
    bannerMessage = 'Requesting a new route';
    bannerTone = 'info';
  } else if (input.rerouteStatus === 'received') {
    bannerMessage = 'New route ready';
    bannerTone = 'success';
  } else if (input.rerouteStatus === 'applying') {
    bannerMessage = 'Applying new route';
    bannerTone = 'info';
  } else if (input.rerouteStatus === 'resuming') {
    bannerMessage = 'Resuming navigation';
    bannerTone = 'info';
  } else if (states.offRouteState === 'OFF_ROUTE' || input.isOffRoute) {
    bannerMessage = 'Off route';
    bannerTone = 'danger';
  } else if (states.offRouteState === 'DEVIATING') {
    bannerMessage = 'Checking route';
    bannerTone = 'warning';
  } else if (states.offRouteState === 'REROUTING') {
    bannerMessage = 'Recalculating route';
    bannerTone = 'info';
  } else if (states.offRouteState === 'REJOINING') {
    bannerMessage = 'Returning to route';
    bannerTone = 'info';
  } else if (states.offRouteState === 'REJOINED') {
    bannerMessage = 'Back on route';
    bannerTone = 'success';
  } else if (states.lifecycleState === 'APPROACHING_ROUTE') {
    bannerMessage = 'Approaching route';
    bannerTone = 'info';
  } else if (states.lifecycleState === 'OVERVIEW') {
    bannerMessage = 'Route overview';
    bannerTone = 'neutral';
  } else if (states.lifecycleState === 'IDLE') {
    bannerMessage = 'Navigation inactive';
    bannerTone = 'neutral';
  } else {
    bannerMessage = 'On route';
    bannerTone = 'success';
  }

  if (input.replayStatus === 'playing') {
    bannerMessage = `Replay · ${bannerMessage}`;
  } else if (input.replayStatus === 'paused') {
    bannerMessage = `Replay paused · ${bannerMessage}`;
  }

  return {
    ...states,
    isOffRoute: input.isOffRoute,
    rerouteStatus: input.rerouteStatus,
    replayStatus: input.replayStatus,
    bannerMessage,
    bannerTone,
  };
}

function monotonicNow() {
  return performance.now();
}

export function useNavigationViewModel(
  input: NavigationViewModelInput & {
    sampleIndex: number | null;
    correlationId: string | null;
  },
) {
  const model = buildNavigationViewModel(input);
  const [now, setNow] = useState(monotonicNow);
  const lastChangedAt = useRef({
    lifecycleState: monotonicNow(),
    offRouteState: monotonicNow(),
  });
  const previous = useRef<NavigationStateSnapshot | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(monotonicNow()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const current: NavigationStateSnapshot = {
      lifecycleState: model.lifecycleState,
      offRouteState: model.offRouteState,
    };
    const prior = previous.current;
    const dimensions: NavigationStateTransitionEvent['dimension'][] = prior
      ? [
          ...(prior.lifecycleState !== current.lifecycleState ? ['lifecycleState' as const] : []),
          ...(prior.offRouteState !== current.offRouteState ? ['offRouteState' as const] : []),
        ]
      : ['lifecycleState', 'offRouteState'];
    const monotonicTimestampMs = monotonicNow();
    const wallClockTimestamp = new Date().toISOString();

    for (const dimension of dimensions) {
      const before = prior ?? {
        lifecycleState: current.lifecycleState,
        offRouteState: current.offRouteState,
      };
      if (dimension === 'lifecycleState') {
        lastChangedAt.current.lifecycleState = monotonicTimestampMs;
      } else {
        lastChangedAt.current.offRouteState = monotonicTimestampMs;
      }

      const event: NavigationStateTransitionEvent = {
        eventType: 'navigation-state-transition',
        dimension,
        monotonicTimestampMs,
        wallClockTimestamp,
        sampleIndex: input.sampleIndex,
        correlationId: input.correlationId,
        before,
        after: current,
      };
      console.info(JSON.stringify(event));
    }

    previous.current = current;
    setNow(monotonicTimestampMs);
  }, [
    input.correlationId,
    input.sampleIndex,
    model.lifecycleState,
    model.offRouteState,
  ]);

  return {
    ...model,
    lifecycleChangedAgoMs: Math.max(0, now - lastChangedAt.current.lifecycleState),
    offRouteChangedAgoMs: Math.max(0, now - lastChangedAt.current.offRouteState),
  };
}
