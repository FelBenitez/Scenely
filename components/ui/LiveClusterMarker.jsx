// components/ui/LiveClusterMarker.jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LiveClusterMarker({
  size = 36,
  ringColor = '#60a5fa',
  count = 2,
}) {
  const ring = Math.max(2, Math.round(size * 0.12));
  const inner = size - ring * 2;
  const label = count > 99 ? '99+' : String(count);

  return (
    <View style={[styles.shadow, { width: size, height: size }]}>
      <View
        style={[
          styles.ring,
          {
            borderColor: ringColor,
            borderWidth: ring,
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <View
          style={[
            styles.inner,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <Text style={styles.count}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.88)', // near-black
  },
  count: { color: '#fff', fontWeight: '800', fontSize: 12 },
  shadow: { alignItems: 'center', justifyContent: 'center' },
});