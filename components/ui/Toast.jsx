// components/ui/Toast.jsx
import React, { useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, Pressable, Keyboard, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DURATION = { default: 3200, success: 3200, error: 3200, info: 3200, warn: 3200 };
const BG = {
  default: 'rgba(17,17,17,0.92)',
  success: '#16a34a',
  error: '#ef4444',
  info: 'rgba(17,17,17,0.92)',
  warn: '#f59e0b',
};

const Toast = forwardRef(function Toast(_, ref) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(24)).current;     // translateY
  const op = useRef(new Animated.Value(0)).current;     // opacity
  const msgRef = useRef('');
  const typeRef = useRef('default');
  const kbH = useRef(0);
  const timer = useRef(null);
  const drag = useRef(new Animated.Value(0)).current;   // for swipe dismiss

  useEffect(() => {
    const s1 = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      kbH.current = Math.max(0, e.endCoordinates?.height ?? 0);
    });
    const s2 = Keyboard.addListener('keyboardDidHide', () => (kbH.current = 0));
    return () => { s1.remove(); s2.remove(); clearTimeout(timer.current); };
  }, []);

  function animateIn() {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(y,  { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }
  function animateOut(cb) {
    Animated.parallel([
      Animated.timing(op, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(y,  { toValue: 24, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(cb);
  }

  useImperativeHandle(ref, () => ({
    show(message, { type = 'default', duration } = {}) {
      clearTimeout(timer.current);
      msgRef.current = message;
      typeRef.current = type;
      animateIn();
      const ms = duration ?? DURATION[type] ?? DURATION.default;
      timer.current = setTimeout(() => animateOut(), ms);
    },
    hide() { clearTimeout(timer.current); animateOut(); },
  }));

  const bottomOffset = (kbH.current > 0 ? kbH.current + 16 : insets.bottom + 110); // above FAB/home

  const bg = BG[typeRef.current] ?? BG.default;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: bottomOffset }]}
      accessibilityLiveRegion="polite"
    >
      <Animated.View
        style={[
          styles.wrap,
          { backgroundColor: bg, opacity: op, transform: [{ translateY: y }, { translateY: drag }] },
        ]}
        // simple swipe-to-dismiss
        {...{
          onStartShouldSetResponder: () => true,
          onResponderMove: (e) => drag.setValue(Math.max(0, e.nativeEvent.dy)),
          onResponderRelease: (e) => {
            if (e.nativeEvent.dy > 40) animateOut();
            else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
          },
        }}
      >
        <Pressable onPress={() => animateOut()}>
          <Text style={styles.text} numberOfLines={2}>{msgRef.current}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
});

export default Toast;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  wrap: {
    maxWidth: 520,
    width: '88%',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  text: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 14, lineHeight: 18 },
});