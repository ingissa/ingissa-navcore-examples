import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { LocationSample } from '../navigation/types.ts';
import { toLocationSample } from './locationSample.ts';

export type ForegroundLocationStatus =
  | 'idle'
  | 'requesting-permission'
  | 'tracking'
  | 'denied'
  | 'error';

/**
 * Foreground-only GPS source for the official demonstration. It deliberately
 * does not request background permission or register a background task.
 */
export function useForegroundLocation() {
  const [position, setPosition] = useState<LocationSample | null>(null);
  const [status, setStatus] = useState<ForegroundLocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const requestRef = useRef<Promise<LocationSample> | null>(null);

  const stop = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    requestRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async (): Promise<LocationSample> => {
    if (requestRef.current) {
      return requestRef.current;
    }

    const request = (async () => {
      setStatus('requesting-permission');
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        throw new Error(
          permission.canAskAgain
            ? 'Foreground location permission was not granted.'
            : 'Foreground location permission is denied. Enable it in device settings to use live GPS.',
        );
      }

      const initial = toLocationSample(
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      );
      setPosition(initial);
      subscriptionRef.current?.remove();
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1_000,
          distanceInterval: 3,
        },
        (next) => setPosition(toLocationSample(next)),
        (reason) => {
          setStatus('error');
          setError(reason);
        },
      );
      setStatus('tracking');
      return initial;
    })();

    requestRef.current = request;
    try {
      return await request;
    } catch (startError) {
      if (!(startError instanceof Error && startError.message.includes('not granted'))) {
        setStatus('error');
      }
      setError(startError instanceof Error ? startError.message : 'Unable to start foreground GPS.');
      throw startError;
    } finally {
      requestRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { position, status, error, start, stop };
}
