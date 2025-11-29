// app/(tabs)/_layout.tsx
import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Newspaper, MapPin, User2 } from 'lucide-react-native';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function MapTabIcon({
  focused,
  color,
  size,
}: {
  focused: boolean;
  color: string;
  size: number;
}) {
  // 🔁 Swap this MapPin out for your custom Scenely "S" logo later.
  return (
    <MapPin
      size={size + 2}
      color={color}
      strokeWidth={2.2}
    />
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();

  const activeColor = '#F97316'; // brand orange
  const inactiveColor = '#A1A1AA';

  return (
    <Tabs
      initialRouteName="map"
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,

        // Colors
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,

        // Static, flush-at-bottom bar with blur + shadow
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 55 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopWidth: 0.5,
          borderTopColor:
            colorScheme === 'dark'
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.1)',
          backgroundColor: Platform.OS === 'ios'
            ? 'transparent'
            : colorScheme === 'dark'
              ? 'rgba(15, 23, 42, 0.95)'
              : 'rgba(255, 255, 255, 0.95)',
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.1,
              shadowRadius: 10,
            },
            android: {
              elevation: 12,
            },
          }),
        },

        // Frosted glass background
        tabBarBackground: () => (
          <BlurView
            intensity={colorScheme === 'dark' ? 40 : 25}
            tint={colorScheme === 'dark' ? 'dark' : 'light'}
            style={{ flex: 1 }}
          />
        ),

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      {/* FEED TAB */}
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size, focused }) => (
            <Newspaper
              size={size}
              color={color}
              strokeWidth={2.2}
            />
          ),
        }}
      />

      {/* MAP TAB (hero tab, logo-ready) */}
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <MapTabIcon focused={focused} color={color} size={size} />
          ),
        }}
      />

      {/* PROFILE TAB */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <User2
              size={size}
              color={color}
              strokeWidth={2.2}
            />
          ),
        }}
      />
    </Tabs>
  );
}