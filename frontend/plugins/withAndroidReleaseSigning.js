const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Re-applies the release signingConfig every time `expo prebuild` regenerates
 * android/app/build.gradle (that file is gitignored and rebuilt from scratch,
 * so any manual edit to it would otherwise be lost on the next prebuild).
 *
 * Reads credentials from frontend/android/keystore.properties (gitignored,
 * not committed) which points at the actual keystore file kept in
 * frontend/secrets/. If keystore.properties is missing (e.g. on a machine
 * that never received the secret), the release build silently falls back to
 * being signed with the debug key so the project still builds.
 */
const withAndroidReleaseSigning = (config) => {
  return withAppBuildGradle(config, (config) => {
    const marker = 'keystorePropertiesFile';
    if (config.modResults.contents.includes(marker)) {
      // Already applied (e.g. plugin ran twice) - don't duplicate.
      return config;
    }

    let contents = config.modResults.contents;

    // 1. Inject the keystore.properties loader right before `android {`.
    contents = contents.replace(
      /android\s*\{/,
      `def keystorePropertiesFile = rootProject.file("keystore.properties")\n` +
        `def keystoreProperties = new Properties()\n` +
        `if (keystorePropertiesFile.exists()) {\n` +
        `    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))\n` +
        `}\n\n` +
        `android {`
    );

    // 2. Add a `release` signingConfig alongside the default `debug` one.
    contents = contents.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {\n` +
        `        if (keystorePropertiesFile.exists()) {\n` +
        `            release {\n` +
        `                storeFile file(keystoreProperties['storeFile'])\n` +
        `                storePassword keystoreProperties['storePassword']\n` +
        `                keyAlias keystoreProperties['keyAlias']\n` +
        `                keyPassword keystoreProperties['keyPassword']\n` +
        `            }\n` +
        `        }`
    );

    // 3. Point the `release` buildType at the release signingConfig when available.
    contents = contents.replace(
      /(release\s*\{[^}]*?signingConfig\s+)signingConfigs\.debug/,
      `$1keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug`
    );

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = withAndroidReleaseSigning;
