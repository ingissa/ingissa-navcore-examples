import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LicenseStatus, NavCoreOptions, NavInstruction } from '@ingissa/navcore-core';
import { useNavCore } from '@ingissa/navcore-react-native';
import {
  collectLicenseRuntimeDiagnostics,
  navCorePackageVersions,
} from './licenseRuntimeDiagnostics.ts';
import { startAtomicNavigationSession } from './atomicSessionStart.ts';
import type { LocationSample, NeutralRoute } from './types.ts';

export function useNavigationSession(
  route: NeutralRoute | null,
  location: LocationSample | null,
  externallyDriven = false,
) {
  const instructions = useMemo<NavInstruction[]>(
    () =>
      (route?.instructions ?? []).map((instruction) => ({
        location: instruction.coordinate,
        geometryIndex: instruction.geometryIndex,
        text: instruction.text,
      })),
    [route],
  );

  const options = useMemo<NavCoreOptions>(
    () => ({
      isDev: false,
      // Must match the `bid` claim in a Navcore Suite license. The default
      // mirrors app.json while allowing a white-label build to override it.
      applicationId: process.env.EXPO_PUBLIC_NAVCORE_APPLICATION_ID || 'com.udereva.app',
      ...(process.env.EXPO_PUBLIC_NAVCORE_LICENSE_KEY
        ? { licenseKey: process.env.EXPO_PUBLIC_NAVCORE_LICENSE_KEY }
        : {}),
    }),
    [],
  );

  const navigation = useNavCore({
    gpsCoord: externallyDriven ? null : location?.coordinate ?? null,
    gpsBearing: externallyDriven ? null : location?.bearing ?? null,
    gpsAccuracy: externallyDriven ? null : location?.accuracyMeters ?? null,
    gpsTimestamp: externallyDriven ? null : location?.timestamp ?? null,
    speed: location?.speedMetersPerSecond ?? 0,
    routeGeometry: route?.geometry ?? null,
    instructions,
    isNavigating: route !== null,
    options,
  });

  const startAtomicSession = useCallback(
    (initialLocation: LocationSample) => {
      if (!route) {
        return Promise.reject(new Error('Cannot start navigation before a route is loaded.'));
      }
      return startAtomicNavigationSession(
        navigation.engine,
        route,
        instructions,
        initialLocation,
      );
    },
    [instructions, navigation.engine, route],
  );
  const startAtomicSessionFor = useCallback(
    (targetRoute: NeutralRoute, initialLocation: LocationSample) => {
      const targetInstructions: NavInstruction[] = targetRoute.instructions.map((instruction) => ({
        location: instruction.coordinate,
        geometryIndex: instruction.geometryIndex,
        text: instruction.text,
      }));
      return startAtomicNavigationSession(
        navigation.engine,
        targetRoute,
        targetInstructions,
        initialLocation,
      );
    },
    [navigation.engine],
  );

  const licenseManager = navigation.engine.getLicenseManager();
  const licenseKey = options.licenseKey;
  const [licenseStatus, setLicenseStatus] = useState(() => licenseManager.getStatus());
  const licenseValidationRef = useRef<{
    key: string;
    promise: Promise<LicenseStatus>;
  } | null>(null);
  const licenseManagerRef = useRef(licenseManager);
  licenseManagerRef.current = licenseManager;
  const configuredIsDev = options.isDev ?? false;
  const runtimeDiagnosticsEnabled =
    process.env.EXPO_PUBLIC_NAVCORE_LICENSE_DIAGNOSTICS === 'true';

  useEffect(() => {
    const manager = licenseManagerRef.current;
    if (!licenseKey) {
      licenseValidationRef.current = null;
      setLicenseStatus(manager.getStatus());
      if (runtimeDiagnosticsEnabled) {
        void collectLicenseRuntimeDiagnostics(undefined, {
          configuredIsDev,
          licenseStatus: manager.getStatus(),
          proEnabled: manager.isProEnabled(),
          daysToExpiry: null,
          packageVersions: navCorePackageVersions,
        }).then(
          (diagnostics) =>
            console.info(
              `[navigation-poc] Licence runtime metadata: ${JSON.stringify(diagnostics)}`,
            ),
          () => console.error('[navigation-poc] Licence runtime metadata collection failed.'),
        );
      }
      return;
    }

    if (licenseValidationRef.current?.key !== licenseKey) {
      licenseValidationRef.current = {
        key: licenseKey,
        promise: manager.validate(licenseKey),
      };
    }

    let active = true;
    void licenseValidationRef.current.promise.then(
      (status) => {
        if (active) {
          setLicenseStatus(status);
          const payload = manager.getPayload();
          const daysToExpiry =
            payload?.exp == null ? null : Math.floor((payload.exp - Date.now()) / 86_400_000);
          if (runtimeDiagnosticsEnabled) {
            void collectLicenseRuntimeDiagnostics(licenseKey, {
              configuredIsDev,
              licenseStatus: status,
              proEnabled: manager.isProEnabled(),
              daysToExpiry,
              packageVersions: navCorePackageVersions,
            }).then(
              (diagnostics) =>
                console.info(
                  `[navigation-poc] Licence runtime metadata: ${JSON.stringify(diagnostics)}`,
                ),
              () => console.error('[navigation-poc] Licence runtime metadata collection failed.'),
            );
          }
        }
      },
      () => {
        if (active) {
          console.error('[navigation-poc] Public NavCore licence validation failed.');
          setLicenseStatus(manager.getStatus());
        }
      },
    );

    return () => {
      active = false;
    };
  }, [configuredIsDev, licenseKey, runtimeDiagnosticsEnabled]);

  return {
    ...navigation,
    licenseStatus,
    isProEnabled: licenseManager.isProEnabled(),
    startAtomicSession,
    startAtomicSessionFor,
  };
}
