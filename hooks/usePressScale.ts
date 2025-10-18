// components/hooks/usePressScale.ts
import { useRef } from 'react';
import { Animated, Easing } from 'react-native';

export default function usePressScale(min = 0.95) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.timing(scale, {
      toValue: min,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const pressOut = () =>
    Animated.timing(scale, {
      toValue: 1,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return { scale, pressIn, pressOut };
}