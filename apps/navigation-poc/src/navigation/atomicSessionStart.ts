import type { NavCore, NavCoreState, NavInstruction } from '@ingissa/navcore-core';
import type { LocationSample, NeutralRoute } from './types.ts';

export async function startAtomicNavigationSession(
  engine: NavCore,
  route: NeutralRoute,
  instructions: NavInstruction[],
  initialLocation: LocationSample,
  timeoutMs = 10_000,
  onRouteApplied?: () => void,
): Promise<NavCoreState> {
  if (route.geometry.length < 2) {
    throw new Error('Cannot start navigation without route geometry.');
  }

  if (!Number.isFinite(initialLocation.timestamp)) {
    throw new Error('Cannot start navigation without a valid initial location timestamp.');
  }

  return new Promise<NavCoreState>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      engine.off('update', onUpdate);
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    };

    const finish = (error?: Error, state?: NavCoreState) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else if (state) {
        resolve(state);
      } else {
        reject(new Error('Navigation session completed without a state.'));
      }
    };

    const checkOnRoute = () => {
      const state = engine.getState();
      if (state.lifecycleState === 'ON_ROUTE' && state.offRouteState === 'ON_ROUTE') {
        finish(undefined, state);
      }
    };

    const onUpdate = () => checkOnRoute();
    engine.on('update', onUpdate);
    timeout = setTimeout(() => {
      const state = engine.getState();
      finish(
        new Error(
          `Navigation did not become ready before timeout (lifecycle=${state.lifecycleState}, offRoute=${state.offRouteState}).`,
        ),
      );
    }, timeoutMs);

    try {
      engine.getOffRouteFSM().reset();
      engine.getLifecycleFSM().reset();
      engine.setRoute(route.geometry, instructions);
      onRouteApplied?.();
      engine.startNavigation();
      engine.update({
        coord: initialLocation.coordinate,
        accuracy: initialLocation.accuracyMeters,
        bearing: initialLocation.bearing,
        speed: initialLocation.speedMetersPerSecond,
        timestamp: initialLocation.timestamp,
      });
      checkOnRoute();
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error('Failed to start the navigation session.'),
      );
    }
  });
}
