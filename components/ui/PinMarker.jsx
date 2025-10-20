import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Defs, ClipPath, Circle, Path, G, Image as SvgImage } from 'react-native-svg';

export const categoryTint = (key = 'event') => ({
  talk: '#0EA5E9',
  here: '#22C55E',
  event: '#7C3AED',
  freebies: '#FF8A4C',
}[key] || '#7C3AED');

export default function PinMarker({
  size = 80,
  tint = '#7C3AED',
  avatarUrl,
  label,
  selected = false,
  onPress,
  minutesLeft = 240,   // NEW
  totalMinutes = 240,  // NEW
}) {
  const ringWidth = selected ? 3.5 : 3;
  const radius = size / 2;

  // Make the tail short & fat and ensure the tip sits at the actual bottom of the MarkerView
  const tailLength = Math.round(size * 0.28); // ~28% of head size
  const tipY = size + tailLength;             // absolute Y for the tip
  const totalHeight = tipY + 2;               // canvas height; keeps tip near bottom (no tall empty space)

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (selected) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, friction: 6, tension: 140 }),
        Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, friction: 7, tension: 120 }),
      ]).start();
    }
  }, [selected]);

  // Circle head center (shifted down slightly so it hugs the tail)
  const cx = radius;
  const cy = radius + 14;       // drop the head a bit more so it hugs the tail

  // Tail geometry (shorter, wider, upside‑down triangle look)
  const neckWidth = radius * 1.23;  // very wide neck
  const joinY = cy + radius - 46;   // increase overlap into the head by ~12px (brings them tighter)

  // Short, wide tail path (triangle-like)
  const tailPath = `
    M ${cx},${joinY}
    Q ${cx + neckWidth},${joinY + 0} ${cx},${tipY}
    Q ${cx - neckWidth},${joinY + 0} ${cx},${joinY}
    Z
  `;

  // draw the progress ring centered:
  const rOuter = radius - ringWidth - 9;
  const rInner = radius - ringWidth - 14.5;
 const ringThickness = (rOuter - rInner) * 0.40;     // thinner ring (55% of the gap)
const rProg = rOuter - ringThickness * 1.6;          // move slightly inward toward center
  const C = 2 * Math.PI * rProg;

  // Clamp and normalize progress (clockwise)
  const clamped = Math.max(0, Math.min(totalMinutes, minutesLeft ?? totalMinutes));
  const progress = clamped / totalMinutes; // 1.0 fresh -> 0.0 expired

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.touchable}>
        <View
          style={{
            width: size,
            height: totalHeight,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <Svg width={size} height={totalHeight} viewBox={`0 0 ${size} ${totalHeight}`}>
            <Defs>
              <ClipPath id="avatarClip">
                <Circle cx={cx} cy={cy} r={radius - ringWidth - 6} />
              </ClipPath>
            </Defs>

            {/* Tail only (drawn first). The circle head + rings are drawn after. */}
            <Path d={tailPath} fill={tint} stroke={tint} strokeWidth={1.5} />

            {/* Outer circle (same exact size as before) */}
            <Circle cx={cx} cy={cy} r={radius - ringWidth - 9} fill={tint} />

            {/* Progress ring between outer fill and gray slot */}
            <G transform={`rotate(-90 ${cx} ${cy})`}>
            {/* base ring (purple remainder) */}
            <Circle
                cx={cx}
                cy={cy}
                r={rProg}
                stroke={tint}
                strokeWidth={ringThickness}
                fill="none"
            />
            {/* active arc (white progress) */}
            <Circle
                cx={cx}
                cy={cy}
                r={rProg}
                stroke="#FFFFFF"
                strokeWidth={ringThickness}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${C * progress},${C}`}
            />
            </G>

            {/* //Gray inner circle slot */}
            <Circle cx={cx} cy={cy} r={radius - ringWidth - 16.5} fill="#D1D5DB" />

          </Svg>

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
  touchable: { alignItems: 'center' },
  bubble: {
    position: 'absolute',
    left: 44,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});