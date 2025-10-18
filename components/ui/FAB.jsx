// components/ui/FAB.jsx
import React, {useEffect}from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import usePressScale from '../../hooks/usePressScale';
import { hapticLight } from './Haptics';

export default function FAB({ onPress, visible = true }) {
  const { scale, pressIn, pressOut, reset } = usePressScale(0.90);

    useEffect(() => {
    if (visible) {
      reset();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={() => { pressIn(); hapticLight(); }}
        onPressOut={pressOut}
        onPress={onPress}
        style={styles.btn}
      >
        <View style={styles.plusH} />
        <View style={styles.plusV} />
      </Pressable>
    </Animated.View>
  );
}

const ORANGE = '#FF6B35';

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  btn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  plusH: { position: 'absolute', width: 30, height: 4, backgroundColor: '#fff', borderRadius: 2 },
  plusV: { position: 'absolute', width: 4, height: 28, backgroundColor: '#fff', borderRadius: 2 },
});