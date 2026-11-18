// react-native-gesture-handler is installed only as a peer of expo-router's JS Stack and
// Drawer navigators, which this app does not use (it uses js-tabs), so its native code is
// not linked: smaller APK and less C++ to build. If you add a JS Stack or Drawer, remove this.
module.exports = {
  dependencies: {
    'react-native-gesture-handler': {
      platforms: { android: null, ios: null },
    },
  },
};
