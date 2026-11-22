const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Allows the development client to call a locally hosted HTTP Valhalla service.
 * This must never be enabled for production builds: configure an HTTPS endpoint
 * through EXPO_PUBLIC_VALHALLA_URL instead.
 */
module.exports = function withAndroidCleartextTraffic(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const application = androidConfig.modResults.manifest.application?.[0];

    if (!application) {
      throw new Error('AndroidManifest.xml does not contain an application element.');
    }

    application.$ = {
      ...application.$,
      'android:usesCleartextTraffic': 'true',
    };

    return androidConfig;
  });
};
