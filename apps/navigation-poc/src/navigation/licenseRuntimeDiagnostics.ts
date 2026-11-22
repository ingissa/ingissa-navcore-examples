import type { LicenseStatus } from '@ingissa/navcore-core';

export interface NavCorePackageVersions {
  core: string;
  reactNative: string;
}

export const navCorePackageVersions: NavCorePackageVersions = {
  core: '1.0.8',
  reactNative: '1.0.8',
};

export interface LicenseRuntimeDiagnostics {
  capturedAt: string;
  configuredIsDev: boolean;
  licenseStatus: LicenseStatus | 'NOT_CHECKED';
  proEnabled: boolean;
  tier: 'Core' | 'Pro' | 'Dev (inferred)' | 'unknown';
  tierVerification: 'public status and Pro flag' | 'inferred from explicit mode and public status';
  daysToExpiry: number | null;
  validationReasonCode: null;
  licenseKey: {
    set: boolean;
  };
  runtime: {
    cryptoObject: boolean;
    cryptoSubtle: boolean;
    atob: boolean;
    buffer: boolean;
    textEncoder: boolean;
    hermes: boolean;
    timeZone: string | null;
    utcOffsetMinutes: number;
  };
  navCorePackageVersions: NavCorePackageVersions;
}

export async function collectLicenseRuntimeDiagnostics(
  licenseKey: string | undefined,
  options: {
    configuredIsDev: boolean;
    licenseStatus: LicenseStatus | 'NOT_CHECKED';
    proEnabled: boolean;
    daysToExpiry: number | null;
    packageVersions: NavCorePackageVersions;
  },
): Promise<LicenseRuntimeDiagnostics> {
  const key = typeof licenseKey === 'string' ? licenseKey : '';
  const keyIsSet = key.length > 0;
  const cryptoSubtleAvailable =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined';
  const runtimeGlobals = globalThis as typeof globalThis & {
    Buffer?: unknown;
    HermesInternal?: unknown;
  };
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  const tier =
    options.licenseStatus === 'VALID' && options.proEnabled
      ? 'Pro'
      : options.configuredIsDev
        ? 'Dev (inferred)'
        : options.licenseStatus === 'NOT_CHECKED'
          ? 'unknown'
          : 'Core';

  return {
    capturedAt: now.toISOString(),
    configuredIsDev: options.configuredIsDev,
    licenseStatus: options.licenseStatus,
    proEnabled: options.proEnabled,
    tier,
    tierVerification:
      tier === 'Pro' ? 'public status and Pro flag' : 'inferred from explicit mode and public status',
    daysToExpiry: options.daysToExpiry,
    validationReasonCode: null,
    licenseKey: {
      set: keyIsSet,
    },
    runtime: {
      cryptoObject: typeof globalThis.crypto !== 'undefined',
      cryptoSubtle: cryptoSubtleAvailable,
      atob: typeof globalThis.atob === 'function',
      buffer: typeof runtimeGlobals.Buffer !== 'undefined',
      textEncoder: typeof globalThis.TextEncoder === 'function',
      hermes: typeof runtimeGlobals.HermesInternal !== 'undefined',
      timeZone,
      utcOffsetMinutes: -now.getTimezoneOffset(),
    },
    navCorePackageVersions: options.packageVersions,
  };
}
