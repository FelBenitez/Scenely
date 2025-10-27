// components/ui/LiveClusterMarker.jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LiveClusterMarker({
  size = 36,
  ringColor = '#22c55e',
  count = 2,
}) {
  const s = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: 'white',
    borderWidth: 2,
    backgroundColor: ringColor,
  };
  return (
    <View style={[styles.wrap, s]}>
      <Text style={styles.txt}>{count >= 100 ? '99+' : String(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  txt: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
  },
});