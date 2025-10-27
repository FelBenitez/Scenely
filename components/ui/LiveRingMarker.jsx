// components/ui/LiveRingMarker.jsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, ClipPath, Image as SvgImage } from 'react-native-svg';

export default function LiveRingMarker({
  size = 32,
  ringColor = '#22c55e',
  avatarUrl = null,
  ringThickness = 4,
}) {
  const r = size / 2;
  const inner = r - ringThickness - 1;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Ring */}
        <Circle cx={r} cy={r} r={r - ringThickness / 2 - 0.5} stroke={ringColor} strokeWidth={ringThickness} fill="white" />
        {/* Avatar clip */}
        <Defs>
          <ClipPath id="liveAvatarClip">
            <Circle cx={r} cy={r} r={inner} />
          </ClipPath>
        </Defs>
        {/* Avatar/placeholder */}
        {avatarUrl ? (
          <SvgImage
            x={r - inner}
            y={r - inner}
            width={inner * 2}
            height={inner * 2}
            preserveAspectRatio="xMidYMid slice"
            href={{ uri: avatarUrl }}
            clipPath="url(#liveAvatarClip)"
          />
        ) : (
          <Circle cx={r} cy={r} r={inner} fill="#E5E7EB" />
        )}
      </Svg>
    </View>
  );
}