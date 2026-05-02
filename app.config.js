import 'dotenv/config';

export default () => ({
  expo: {
    name: "Scenely",
    slug: "Scenely",
    owner: "scenely",
    version: "1.0.1",
    scheme: "scenely",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.joinscenely.scenely",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Scenely uses your location to show nearby events and activity on the map.",
          NSCameraUsageDescription: "Allow camera access to attach a photo to your post.",
          NSPhotoLibraryUsageDescription: "Allow photo library access to attach a photo to your post.",
          "ITSAppUsesNonExemptEncryption": false,
      },
    },

    android: {
      package: "com.joinscenely.scenely",
      versionCode: 1,
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "CAMERA"],
    },

    web: { output: "static", favicon: "./assets/images/favicon.png" },

    plugins: [
      [
        "@rnmapbox/maps",
        {
          RNMapboxMapsImpl: "mapbox",
          RNMAPBOX_MAPS_DOWNLOAD_TOKEN: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN,
        },
      ],
      "expo-web-browser",
      // Native config-needed modules:
      "expo-secure-store",
      ["expo-location", { isIosBackgroundLocationEnabled: false }], // flip to true only if i implement it
      "expo-notifications",
      "expo-image-picker",
      "expo-localization",
      "expo-font",
      "expo-build-properties",
      
      [
        "expo-build-properties",
        {
          "android": { "kotlinVersion": "1.7.22" },
          "ios": { "useFrameworks": "static" }
        }
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
      author: "Felipe Benitez",
    },
  },
});