import React, { useEffect, useRef, useState } from 'react';
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
  text,              // NEW
  photoUrl,          // NEW
  label,
  selected = false,
  onPress,
  minutesLeft = 240,   // NEW
  totalMinutes = 240,  // NEW
  createdAt = null,    // NEW: ISO string or Date
}) {
  const ringWidth = selected ? 3.5 : 3;
  const radius = size / 2;

  // Make the tail short & fat and ensure the tip sits at the actual bottom of the MarkerView
  const tailLength = Math.round(size * 0.28); // ~28% of head size
  const tipY = size + tailLength;             // absolute Y for the tip
  const totalHeight = tipY + 2;               // canvas height; keeps tip near bottom (no tall empty space)

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  // If createdAt is provided, keep a local, minute-ticking minutesLeft.
  const [liveMinutesLeft, setLiveMinutesLeft] = useState(minutesLeft);

  useEffect(() => {
    if (!createdAt) return; // fall back to minutesLeft prop
    const startMs = new Date(createdAt).getTime();

    const compute = () => {
      const elapsedMin = Math.floor((Date.now() - startMs) / 60000);
      const left = Math.max(0, totalMinutes - elapsedMin);
      setLiveMinutesLeft(left);
    };

    compute(); // run once immediately
    const id = setInterval(compute, 60_000); // update once per minute while visible
    return () => clearInterval(id);
  }, [createdAt, totalMinutes]);

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

  const rAvatar = radius - ringWidth - 16.5; // exact same as gray circle

  // Choose source of remaining time (createdAt drives a 1-minute tick if provided)
  const remaining = createdAt ? liveMinutesLeft : (minutesLeft ?? totalMinutes);

  // Clamp and normalize progress (clockwise, starts at top and shrinks toward the right first)
  const clamped = Math.max(0, Math.min(totalMinutes, remaining));
  const progress = clamped / totalMinutes; // 1.0 fresh -> 0.0 expired

  const CALLOUT_OFFSET_X = 7;   // horizontal offset from circle center
  const CALLOUT_OFFSET_Y = -24; // vertical offset from circle center (negative is up)

  const CALLOUT_MAX_W = 160;    // maximum visual capsule length
  const TEXT_MAX_W = 120;       // cap text width so it wraps to 2 lines
  const LEADING_SPACER = 12;    // pushes text further right inside the bubble (keeps text from hiding under the pin)

  // Make the MarkerView wider for click area BUT keep the pin centered on the map coordinate
  const TOTAL_W = size + CALLOUT_MAX_W + 24; // full interactive width (pin + callout + padding)
  const HALF_W = TOTAL_W / 2;                // parent center used to keep the pin centered

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[
          styles.touchable,
          { width: TOTAL_W, height: totalHeight }
        ]}
      >
        <View
          style={{
            width: TOTAL_W,
            height: totalHeight,
            position: 'relative',
            overflow: 'visible',
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          {!!text && (
            <Animated.View
              style={[
                styles.calloutWrap,
                {
                  left: HALF_W + CALLOUT_OFFSET_X,   // anchor callout from parent center so pin stays centered
                  top: cy + CALLOUT_OFFSET_Y,
                },
              ]}
            >
              <View
                style={[
                  styles.calloutBubble,
                  { backgroundColor: tint, maxWidth: CALLOUT_MAX_W, paddingLeft: 12 + LEADING_SPACER }
                ]}
              >
                {!!photoUrl && (
                  <View style={styles.thumbWrap}>
                    <View style={[styles.thumb, { backgroundColor: '#ddd' }]}>
                      <Animated.Image
                        source={{ uri: photoUrl }}
                        style={styles.thumbImg}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                )}
                <Text
                  style={[
                    styles.calloutText,
                    { maxWidth: TEXT_MAX_W, flexShrink: 1, flexGrow: 0 }
                  ]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {text}
                </Text>
              </View>
            </Animated.View>
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

            {/* Tail only (drawn first). The circle head + rings are drawn after. */}
            <Path d={tailPath} fill={tint} stroke={tint} strokeWidth={1.5} />

            {/* Outer circle (same exact size as before) */}
            <Circle cx={cx} cy={cy} r={radius - ringWidth - 9} fill={tint} />

            {/* Progress ring: full white base + purple elapsed cover (so white looks like remaining) */}
            {/* Base remaining ring (white, full circle) */}
            <Circle
              cx={cx}
              cy={cy}
              r={rProg}
              stroke="#FFFFFF"
              strokeWidth={ringThickness}
              fill="none"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            {/* Elapsed cover (purple) grows clockwise from 12 o'clock and hides the white */}
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

            {/* //Gray inner circle slot
            <Circle cx={cx} cy={cy} r={radius - ringWidth - 16.5} fill="#D1D5DB" /> */}
            {/* Avatar or gray fallback (image clipped to the exact inner gray circle) */}
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
                {/* Optional: a clean ring on top of the avatar for separation */}
                {/* <Circle cx={cx} cy={cy} r={rAvatar} stroke="rgba(255,255,255,0.9)" strokeWidth={1.2} fill="none" /> */}
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
  // --- Callout bubble (text to the right of pin) ---
  // --- Callout bubble (single capsule to the right) ---
  calloutWrap: {
    position: 'absolute',
    alignItems: 'flex-start',
    zIndex: 0,
    pointerEvents: 'auto',
  },
  calloutBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    alignSelf: 'flex-start',  // prevent stretching full-width by parent
  },
  calloutText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    flexShrink: 0,     // allow wrapping to the specified width without shrinking
  },
  calloutTail: {
    width: 0,
    height: 0,
    alignSelf: 'flex-start',
    marginLeft: 10,     // aligns the tail near the bubble’s left edge
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  thumbWrap: { marginRight: 8 },
  thumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  thumbImg: { width: '100%', height: '100%' },
});