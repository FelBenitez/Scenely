// app/(tabs)/map.jsx
import React from 'react';
import { View, StyleSheet, Text, Button, TouchableOpacity } from 'react-native';
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
      {/* Button overlay */}
      <TouchableOpacity style={styles.fab} onPress={() => { /* no-op for now */ }}>
        <Text style={styles.fabText}>Post</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
      fab: {
      position: 'absolute',
      bottom: 24,
      right: 16,
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#1976D2', // blue
      alignItems: 'center',
      justifyContent: 'center',
      // shadow
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6, // Android shadow
    },
    fabText: {
      color: 'white',
      fontWeight: '600',
    },
});