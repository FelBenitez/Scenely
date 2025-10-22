// components/ui/SpotMarker.jsx
import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet, View, Text } from 'react-native';
import Svg, { Defs, ClipPath, Circle, Path, G, Image as SvgImage } from 'react-native-svg';

export default function SpotMarker({
  size = 80,
  tint = '#7C3AED',
  avatarUrl,
  count = 1,
  minutesLeft = 240,
  totalMinutes = 240,
  selected = false,
  onPress,
}) {
  const ringWidth = selected ? 3.5 : 3;
  const radius = size / 2;

  // Keep your teardrop geometry identical to PinMarker
  const tailLength = Math.round(size * 0.28);
  const tipY = size + tailLength;
  const totalHeight = tipY + 2;

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

  const cx = radius;
  const cy = radius + 14;

  const neckWidth = radius * 1.23;
  const joinY = cy + radius - 46;
  const tailPath = `
    M ${cx},${joinY}
    Q ${cx + neckWidth},${joinY + 0} ${cx},${tipY}
    Q ${cx - neckWidth},${joinY + 0} ${cx},${joinY}
    Z
  `;

  // Ring math (same as PinMarker)
  const rOuter = radius - ringWidth - 9;
  const rInner = radius - ringWidth - 14.5;
  const ringThickness = (rOuter - rInner) * 0.40;
  const rProg = rOuter - ringThickness * 1.6;
  const C = 2 * Math.PI * rProg;

  const rAvatar = radius - ringWidth - 16.5;
  const clamped = Math.max(0, Math.min(totalMinutes, minutesLeft));
  const progress = clamped / totalMinutes;

  // Wrap width equals just the pin, no callout
  const TOTAL_W = size;
  const HALF_W = TOTAL_W / 2;

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.touchable, { width: TOTAL_W, height: totalHeight }]}
      >
        <View style={{ width: TOTAL_W, height: totalHeight }}>
          {/* Count badge (top-right over the head) */}
          {count > 1 && (
            <View style={styles.badgeWrap} pointerEvents="none">
              <View style={[styles.badge, count >= 100 && styles.badgeWide]}>
                <Text style={styles.badgeText}>{count >= 100 ? '99+' : String(count)}</Text>
              </View>
            </View>
          )}

          <Svg
            width={size}
            height={totalHeight}
            viewBox={`0 0 ${size} ${totalHeight}`}
            style={{ position: 'absolute', left: HALF_W - (size / 2), top: 0, zIndex: 2 }}
          >
            <Defs>
              <ClipPath id="avatarClip">
                <Circle cx={cx} cy={cy} r={rAvatar} />
              </ClipPath>
            </Defs>

            {/* Tail */}
            <Path d={tailPath} fill={tint} stroke={tint} strokeWidth={1.5} />

            {/* Head */}
            <Circle cx={cx} cy={cy} r={radius - ringWidth - 9} fill={tint} />

            {/* Progress ring: white remaining + tint elapsed */}
            <Circle
              cx={cx}
              cy={cy}
              r={rProg}
              stroke="#FFFFFF"
              strokeWidth={ringThickness}
              fill="none"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            <Circle
              cx={cx}
              cy={cy}
              r={rProg}
              stroke={tint}
              strokeWidth={ringThickness}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${C * (1 - progress)} ${C}`}
              transform={`rotate(-90 ${cx} ${cy})`}
            />

            {/* Avatar (clipped) */}
            {avatarUrl ? (
              <>
                <G clipPath="url(#avatarClip)">
                  <SvgImage
                    x={cx - rAvatar}
                    y={cy - rAvatar}
                    width={rAvatar * 2}
                    height={rAvatar * 2}
                    preserveAspectRatio="xMidYMid slice"
                    href={{ uri: avatarUrl }}
                  />
                </G>
              </>
            ) : (
              <Circle cx={cx} cy={cy} r={rAvatar} fill="#D1D5DB" />
            )}
          </Svg>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touchable: { alignItems: 'center' },
  badgeWrap: {
    position: 'absolute',
    top: 8,
    right: 6,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  badgeWide: { minWidth: 28, paddingHorizontal: 6 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: '800' },
});