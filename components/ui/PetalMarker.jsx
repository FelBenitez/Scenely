// components/ui/PetalMarker.jsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'react-native';


export default function PetalMarker({
  size = 32,
  avatarUrl,
  photoUrl,
  tint = '#7C3AED',
  offsetX = 0,
  offsetY = 0,
}) {
  const source = photoUrl || avatarUrl;

  return (
    <View
      style={[
        styles.petal,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: tint,
          transform: [{ translateX: offsetX }, { translateY: offsetY }],
        },
      ]}
    >
      {source ? (
        <Image
          source={{ uri: source }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.fallback} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  petal: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -16, // half of default size (32/2)
    marginTop: 36,
    borderWidth: 2,
    overflow: 'hidden',
    opacity: 0.75,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#D1D5DB',
  },
});