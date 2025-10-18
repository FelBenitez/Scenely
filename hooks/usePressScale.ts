// hooks/usePressScale.ts
import { useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

export default function usePressScale(target: number = 0.90) {
  const scale = useRef(new Animated.Value(1)).current;
  const isAnimating = useRef(false);

  // Always reset to 1 on mount
  useEffect(() => {
    scale.setValue(1);
    isAnimating.current = false;
  }, []);

  const pressIn = () => {
    if (isAnimating.current) {
      scale.stopAnimation(() => {
        scale.setValue(1);
        isAnimating.current = false;
      });
    }
    
    isAnimating.current = true;
    Animated.timing(scale, {
      toValue: target,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    isAnimating.current = true;
    
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.06,
        stiffness: 420,
        damping: 16,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        stiffness: 260,
        damping: 18,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start(({ finished }: { finished: boolean }) => {
      isAnimating.current = false;
      if (finished) {
        scale.setValue(1);
      }
    });
  };

  const reset = () => {
    scale.stopAnimation();
    scale.setValue(1);
    isAnimating.current = false;
  };

  return { scale, pressIn, pressOut, reset };
}