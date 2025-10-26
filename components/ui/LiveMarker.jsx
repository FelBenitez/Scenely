// components/ui/LiveMarker.jsx
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function LiveMarker({
  size = 32,
  ringColor = '#22c55e',
  avatarUrl = null,
}) {
  const ring = Math.max(2, Math.round(size * 0.12));
  const inner = size - ring * 2;

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
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: inner, height: inner, borderRadius: inner / 2 }}
          />
        ) : (
          <View
            style={{
              width: inner * 0.55,
              height: inner * 0.55,
              borderRadius: (inner * 0.55) / 2,
              backgroundColor: '#fff',
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff', // creates a clean white gap between ring and avatar
  },
  shadow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});