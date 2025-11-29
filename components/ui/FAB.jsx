// components/ui/FAB.jsx
import React, { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // 1. Import this
import usePressScale from '../../hooks/usePressScale';
import { hapticLight } from './Haptics';

export default function FAB({ onPress, visible = true, style }) { // 2. Add style prop
  const { scale, pressIn, pressOut, reset } = usePressScale(0.90);
  const insets = useSafeAreaInsets(); // 3. Get safe area

  useEffect(() => {
    if (visible) {
      reset();
    }
  }, [visible, reset]);

  if (!visible) return null;

  // 4. Calculate default bottom position (Tab Bar height ~55 + spacing ~20 + safe area)
  const defaultBottom = 75 + insets.bottom;

  return (
    <Animated.View 
      style={[
        styles.wrap, 
        { bottom: defaultBottom }, // Apply the dynamic height
        style, // Allow parent to override if needed
        { transform: [{ scale }] }
      ]}
    >
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
    // bottom: 24, <--- Removed this, we calculate it dynamically now
    zIndex: 50, // Added zIndex to ensure it floats above map layers
  },
  btn: {
    width: 64, // Slight tweak: 64 is a more standard multiple of 4 than 68, but 68 is fine too
    height: 64,
    borderRadius: 32,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  plusH: { position: 'absolute', width: 28, height: 4, backgroundColor: '#fff', borderRadius: 2 },
  plusV: { position: 'absolute', width: 4, height: 28, backgroundColor: '#fff', borderRadius: 2 },
});