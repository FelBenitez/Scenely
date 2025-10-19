// components/ui/PinMarker.jsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Defs, ClipPath, Circle, Path, G, Image as SvgImage } from 'react-native-svg';

// Simple color system for categories
export const categoryTint = (key = 'event') => ({
  talk:     '#0EA5E9',
  here:     '#22C55E',
  event:    '#7C3AED',
  freebies: '#FF8A4C',
}[key] || '#7C3AED');

export default function PinMarker({
  size = 44,
  tint = '#7C3AED',
  avatarUrl,
  label,
  selected = false,
  onPress,
}) {
  const ringWidth = selected ? 3 : 2.5;
  const radius = size / 2;
  const pointerHeight = 12; // Height of the pointy part
  const totalHeight = size + pointerHeight;

  // --- ANIMATION: fade/scale on mount + tiny pop when selected toggles ---
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  // mount animation (120ms)
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(scale,   { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }, []);

  // selected pop (spring to 1.06 then settle to 1)
  useEffect(() => {
    if (selected) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, friction: 6, tension: 140 }),
        Animated.spring(scale, { toValue: 1.0,  useNativeDriver: true, friction: 7, tension: 120 }),
      ]).start();
    }
  }, [selected]);

  // Center of circle
  const cx = radius;
  const cy = radius;

  // Teardrop: circle + triangle pointer
  const teardropPath = `
    M ${cx},${cy - radius}
    A ${radius},${radius} 0 1,1 ${cx},${cy + radius}
    L ${cx},${size + pointerHeight}
    L ${cx},${cy + radius}
    A ${radius},${radius} 0 1,1 ${cx},${cy - radius}
    Z
  `;

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.touchable}>
        <View style={{ width: size, height: totalHeight, position: 'relative' }}>
          {/* Glow halo behind */}
          <View
            style={[
              styles.glow,
              {
                position: 'absolute',
                top: -4,
                left: -6,
                width: size + 12,
                height: size + 12,
                borderRadius: (size + 12) / 2,
                backgroundColor: `${tint}22`,
                shadowColor: tint,
                shadowOpacity: 0.4,
                shadowRadius: 10,
              },
            ]}
          />

          {/* Pin SVG */}
          <Svg width={size} height={totalHeight} viewBox={`0 0 ${size} ${totalHeight}`}>
            <Defs>
              {/* Circular clip for avatar */}
              <ClipPath id="avatarClip">
                <Circle cx={cx} cy={cy} r={radius - ringWidth - 2} />
              </ClipPath>
            </Defs>

            {/* White teardrop background */}
            <Path d={teardropPath} fill="#fff" stroke="#fff" strokeWidth={1} />

            {/* Avatar image (clipped to circle) */}
            {avatarUrl ? (
              <G clipPath="url(#avatarClip)">
                <SvgImage
                  href={{ uri: avatarUrl }}
                  x={ringWidth + 2}
                  y={ringWidth + 2}
                  width={size - (ringWidth + 2) * 2}
                  height={size - (ringWidth + 2) * 2}
                  preserveAspectRatio="xMidYMid slice"
                />
              </G>
            ) : (
              /* Gray fallback circle */
              <Circle cx={cx} cy={cy} r={radius - ringWidth - 2} fill="#D1D5DB" />
            )}

            {/* White inner stroke (separates avatar from ring) */}
            <Circle
              cx={cx}
              cy={cy}
              r={radius - ringWidth - 1}
              stroke="#fff"
              strokeWidth={2}
              fill="none"
            />

            {/* Colored ring */}
            <Circle
              cx={cx}
              cy={cy}
              r={radius - ringWidth / 2}
              stroke={tint}
              strokeWidth={ringWidth}
              fill="none"
            />
          </Svg>

          {/* Label bubble (positioned to the right) */}
          {label && (
            <View style={[styles.bubble, { backgroundColor: tint }]}>
              <Text style={styles.bubbleText} numberOfLines={2}>
                {label}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touchable: {
    alignItems: 'center',
  },
  glow: {
    zIndex: -1,
  },
  bubble: {
    position: 'absolute',
    left: 36,
    top: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: 180,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});