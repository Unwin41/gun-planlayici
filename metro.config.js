// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @anthropic-ai/sdk ships an ESM build (.mjs) with circular imports. After Metro's
// ESM -> CommonJS transform, one module reads a `const` from another before it is
// initialised and the app crashes at startup ("Cannot access
// 'BETA_BROWSER_MEMBER_NAME_VALUES' before initialization"). The package's CommonJS
// build (.js) has the same cycle but no TDZ, so resolve the SDK as `require`.
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;
  if (moduleName === '@anthropic-ai/sdk' || moduleName.startsWith('@anthropic-ai/sdk/')) {
    return resolve(
      {
        ...context,
        isESMImport: false,
        unstable_conditionNames: context.unstable_conditionNames.filter((c) => c !== 'import'),
      },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
