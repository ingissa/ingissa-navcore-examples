import { useEffect, useRef } from 'react';

export function useRerouteOnOffRoute(
  isOffRoute: boolean,
  isReady: boolean,
  requestReroute: () => void | Promise<void>,
  onRouteCleared: () => void,
  onReroutePending: () => void,
) {
  const rerouteStarted = useRef(false);
  const wasOffRoute = useRef(false);
  const callbacks = useRef({ requestReroute, onRouteCleared, onReroutePending });
  callbacks.current = { requestReroute, onRouteCleared, onReroutePending };

  useEffect(() => {
    if (!isOffRoute) {
      const hadBeenOffRoute = wasOffRoute.current;
      wasOffRoute.current = false;
      rerouteStarted.current = false;
      // Clearing status is a transition side effect, not a render side effect.
      // Calling a parent setState callback on every render while on-route can
      // form a callback-identity/update loop in React Native.
      if (hadBeenOffRoute) {
        callbacks.current.onRouteCleared();
      }
      return;
    }
    wasOffRoute.current = true;
    if (rerouteStarted.current || !isReady) {
      return;
    }

    rerouteStarted.current = true;
    callbacks.current.onReroutePending();
    void callbacks.current.requestReroute();
  }, [isOffRoute, isReady]);
}
