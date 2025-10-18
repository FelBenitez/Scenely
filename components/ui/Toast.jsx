// components/ui/Toast.jsx
import React, { useImperativeHandle, forwardRef, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

const Toast = forwardRef(function Toast(_, ref) {
  const y = useRef(new Animated.Value(60)).current;
  const op = useRef(new Animated.Value(0)).current;
  const msgRef = useRef(''); // internal storage

  useImperativeHandle(ref, () => ({
    show(message, duration = 1400) {
      msgRef.current = message;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.parallel([
        Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(y, { toValue: 60, duration: 220, useNativeDriver: true }),
            Animated.timing(op, { toValue: 0, duration: 220, useNativeDriver: true }),
          ]).start();
        }, duration);
      });
    },
  }));

  return (
    <Animated.View style={[styles.wrap, { opacity: op, transform: [{ translateY: y }] }]}>
      <Text style={styles.text}>{msgRef.current}</Text>
    </Animated.View>
  );
});

export default Toast;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 110,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(17,17,17,0.92)',
    borderRadius: 12,
  },
  text: { color: '#fff', fontWeight: '600', textAlign: 'center' },
});