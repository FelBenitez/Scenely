// components/ui/ConfettiBurst.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, View } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';

export default function ConfettiBurst({ fire, onComplete, fabOrigin }) {
  const { width, height } = Dimensions.get('window');

  // Default to bottom-right FAB center (right:16, bottom:24, size:64)
  const originFAB = fabOrigin ?? { x: width - 16 - 32, y: height - 24 - 32 };
  const originLeft = { x: 40, y: height - 24 - 32 };

  // track completions for both cannons so we can signal exactly-once
  const [done, setDone] = useState({ a: false, b: false });
  const lastFireRef = useRef(fire);

  useEffect(() => {
    // reset when fire changes
    if (fire !== lastFireRef.current) {
      lastFireRef.current = fire;
      setDone({ a: false, b: false });
    }
  }, [fire]);

  useEffect(() => {
    if (!fire) return;
    if (done.a && done.b) onComplete?.();
  }, [done, fire, onComplete]);

  if (!fire) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0, right: 0, top: 0, bottom: 0,
        // keep it above siblings; also helps on Android with overlapping MapView
        zIndex: 9999,
        ...(Platform.OS === 'android' ? { elevation: 9999 } : null),
      }}
    >
      {/* Main burst from FAB */}
      <ConfettiCannon
        key={`fab-${fire}`}
        count={140}
        origin={originFAB}
        explosionSpeed={450}   // initial velocity
        fallSpeed={2800}       // slower fall = longer show
        fadeOut
        autoStart
        colors={['#FF6B35', '#FFFFFF', '#BF5700']}
        onAnimationEnd={() => setDone(prev => ({ ...prev, a: true }))}
      />

      {/* Secondary symmetric burst from left */}
      <ConfettiCannon
        key={`left-${fire}`}
        count={80}
        origin={originLeft}
        explosionSpeed={360}
        fallSpeed={3000}
        fadeOut
        autoStart
        colors={['#FFA500', '#FFFFFF']}
        onAnimationEnd={() => setDone(prev => ({ ...prev, b: true }))}
      />
    </View>
  );
}