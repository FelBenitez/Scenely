import React, { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';

const SWITCH_W = 130;   // switch width
const SWITCH_H = 40;    // switch height
const PADDING  = 4;     // inner padding
const KNOB     = 32;    // bigger knob
const TRAVEL   = SWITCH_W - KNOB - PADDING * 2; // how far the knob slides

export default function TopBar({ sharing, onlineCount, onToggle, onFilterPress }) {
  const knobX = useMemo(() => new Animated.Value(sharing ? 1 : 0), []);

  useEffect(() => {
    Animated.spring(knobX, {
      toValue: sharing ? 1 : 0,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [sharing]);

  const knobTranslate = knobX.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRAVEL], // 0..TRAVEL px
  });

  // Label sits on the opposite side of the knob
  const labelText = sharing ? 'Sharing: ON' : 'Sharing: OFF';
  const labelColor = sharing ? '#FFFFFF' : '#6B7280';
  const labelStyle = sharing
    ? { textAlign: 'left',  paddingLeft: 10, paddingRight: KNOB + 12 }
    : { textAlign: 'right', paddingRight: 10, paddingLeft: KNOB + 12 };

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {/* LEFT: Logo + Online Count */}
        <View style={styles.leftSection}>
          <Text style={styles.logo}>Scenely</Text>
          {typeof onlineCount === 'number' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>👥 {onlineCount}</Text>
            </View>
          )}
        </View>

        {/* CENTER: Sharing Toggle */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onToggle(!sharing)}
          style={[
            styles.toggle,
            { backgroundColor: sharing ? 'rgba(255,107,53,0.12)' : 'rgba(156,163,175,0.12)' },
            { marginLeft: 'auto', marginRight: 2 } // <<< pushes it right, small gap before gear
          ]}
        >
          {/* Track fill */}
          <View style={[styles.track, { backgroundColor: sharing ? '#FF6B35' : '#E5E5E5' }]} />

          {/* Knob */}
          <Animated.View
            style={[
              styles.knob,
              { transform: [{ translateX: knobTranslate }] }
            ]}
          />

          {/* Label (kept clear of knob) */}
          <Text style={[styles.toggleText, { color: labelColor }, labelStyle]}>
            {labelText}
          </Text>
        </TouchableOpacity>

        {/* RIGHT: Filter */}
        <TouchableOpacity style={styles.filterBtn} onPress={onFilterPress} activeOpacity={0.75}>
          <Text style={styles.filterIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Stretches the bar full width (your wrapper in map.jsx adds side margins)
  container: {
    width: '100%',
  },
  bar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,           // thicker
    borderRadius: 24,              // a bit rounder for the thicker bar
    minHeight: 56,                 // taller
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 10 },
    }),
    justifyContent: 'flex-start',
  },

  // LEFT
  leftSection: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#BF5700',
    letterSpacing: 1.0, // more spacing between letters
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(191,87,0,0.12)',
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#BF5700' },

  // CENTER TOGGLE
  toggle: {
    position: 'relative',
    height: SWITCH_H,
    width: SWITCH_W,
    borderRadius: SWITCH_H / 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  track: {
    position: 'absolute',
    left: PADDING,
    right: PADDING,
    top: PADDING,
    bottom: PADDING,
    borderRadius: (SWITCH_H - PADDING * 2) / 2,
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    top: PADDING,
    left: PADDING,                 // start at left padding
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  toggleText: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    fontSize: 12,
    fontWeight: '700',
    textAlignVertical: 'center',
    includeFontPadding: false,
    flexWrap: 'nowrap',
    lineHeight: 40, // match SWITCH_H for perfect vertical centering
  },

  // RIGHT
  filterBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(191,87,0,0.08)',
  },
  filterIcon: { fontSize: 18 },
});