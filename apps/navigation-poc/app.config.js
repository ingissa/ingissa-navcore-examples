const appJson = require('./app.json');

module.exports = ({ config }) => {
  const resolvedConfig = config ?? appJson.expo;
  const isDevelopment = process.env.APP_VARIANT === 'development';

  return {
    ...resolvedConfig,
    // Expo SDK 52 no longer accepts android.usesCleartextTraffic in the public
    // config schema.  The local plugin writes the native Android manifest only
    // for the development variant, which is used with a local HTTP Valhalla
    // service. Production builds must use HTTPS.
    plugins: [
      ...(resolvedConfig.plugins ?? []),
      ...(isDevelopment ? ['./plugins/withAndroidCleartextTraffic'] : []),
    ],
  };
};
