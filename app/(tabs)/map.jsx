// app/(tabs)/map.jsx
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';

const token =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_TOKEN;

console.log('Mapbox token prefix:', token?.slice(0, 3)); // should log "pk."
MapboxGL.setAccessToken(token || '');

export default function MapTab() {
  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={MapboxGL.StyleURL.Street}
        onDidFinishLoadingMap={() => console.log('✅ Map finished loading')}
        onMapError={(e) => console.log('🛑 Map error:', e?.nativeEvent)}
        onDidFailLoadingMap={(e) => console.log('🛑 Failed loading map:', e?.nativeEvent)}
      >
        <MapboxGL.Camera centerCoordinate={[-97.7341, 30.2849]} zoomLevel={14} />
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#000' } });