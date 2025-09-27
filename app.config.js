import 'dotenv/config';

export default () => ({
  expo: {
    name: "Scenely",
    slug: "Scenely",
    owner: "scenely",
    version: "1.0.0",
    scheme: "scenely",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.scenely.app",     // <-- add this
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Scenely uses your location to show nearby events and activity on the map.",
      },
    },

    android: {
      package: "com.scenely.app",               // <-- add this (Android id)
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
    },

    web: { output: "static", favicon: "./assets/images/favicon.png" },

    plugins: [
      [
        "@rnmapbox/maps",
        {
          RNMapboxMapsImpl: "mapbox",
          RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOADS_TOKEN,
        },
      ],
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: { backgroundColor: "#000000" },
        },
      ],
    ],

    experiments: { typedRoutes: true, reactCompiler: true },

    extra: {
      EXPO_PUBLIC_MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
      eas: { projectId: "0381af9c-0b2b-4a4a-957f-c632b2a3505f" },
    },
  },
});