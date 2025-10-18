import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Easing } from 'react-native';
import { useFonts, Inter_700Bold } from '@expo-google-fonts/inter';
import { SlidersHorizontal } from 'lucide-react-native';
import { Feather } from '@expo/vector-icons';


const SWITCH_W = 130;   // switch width
const SWITCH_H = 40;    // switch height
const PADDING  = 4;     // inner padding
const KNOB     = 32;    // bigger knob
const TRAVEL   = SWITCH_W - KNOB - PADDING * 2; // how far the knob slides

export default function TopBar({ sharing, onlineCount, onToggle, onFilterPress }) {
  // CHANGE: drive the whole animation with a single progress value (0=OFF, 1=ON)
  //const progress = useMemo(() => new Animated.Value(sharing ? 1 : 0), []);
    const progress = useRef(new Animated.Value(sharing ? 1 : 0)).current;

  useEffect(() => {
   Animated.timing(progress, {
     toValue: sharing ? 1 : 0,
     duration: 220,                    // tweak 320–420ms to taste
     easing: Easing.inOut(Easing.ease),// smooth slide
     useNativeDriver: true,
   }).start();
 }, [sharing]);

  // CHANGE: knob translate and micro-scale for a “buttery” slide
  const knobTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRAVEL], // 0..TRAVEL px
  });
  const knobScale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.98, 1],
  });

  let [fontsLoaded] = useFonts({
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;


  // Label sits on the opposite side of the knob
  // CHANGE: use cross-fade + slight slide for ON/OFF instead of swapping one text
  const onOpacity = progress; // 0 -> 1
  const offOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const onTx = progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
  const offTx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {/* LEFT: Logo + Online Count */}
        <View style={styles.leftSection}>
          <Text style={styles.logo}>Scenely</Text>
          {typeof onlineCount === 'number' && (
            <View style={styles.badge}>
              <Feather name="users" size={13} color="#BF5700" style={{ marginRight: 4 }} />
              <Text style={styles.badgeText}>{onlineCount}</Text>
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
          <View style={[styles.track, { backgroundColor: sharing ? '#BF5700' : '#E5E5E5' }]} />

          {/* Knob */}
          <Animated.View
            style={[
              styles.knob,
              { transform: [{ translateX: knobTranslate }, { scale: knobScale }] }
            ]}
          />

          {/* Label (kept clear of knob) */}
          {/* CHANGE: Two animated labels—ON and OFF—cross-fade & slide for smoothness */}
          <Animated.Text
            style={[
              styles.toggleText,
              { color: '#FFFFFF', textAlign: 'left', paddingLeft: 10, paddingRight: KNOB + 12,
                opacity: onOpacity, transform: [{ translateX: onTx }] }
            ]}
          >
            Sharing: ON
          </Animated.Text>

          <Animated.Text
            style={[
              styles.toggleText,
              { color: '#6B7280', textAlign: 'right', paddingRight: 10, paddingLeft: KNOB + 12,
                opacity: offOpacity, transform: [{ translateX: offTx }] }
            ]}
          >
            Sharing: OFF
          </Animated.Text>
        </TouchableOpacity>

        {/* RIGHT: Filter */}
        <TouchableOpacity style={styles.filterBtn} onPress={onFilterPress} activeOpacity={0.75}>
          <SlidersHorizontal size={20} color="#BF5700" strokeWidth={2.5} />
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
    minHeight: 64,                 // taller
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18, // To change border shadow
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 12 },
    }),
    justifyContent: 'flex-start',
  },

  // LEFT
  leftSection: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: {
    fontSize: 25,
    fontWeight: '700',
    color: '#BF5700',
    letterSpacing: -0.5, // more spacing between letters
    fontFamily: 'Inter_700Bold',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(191,87,0,0.12)',
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#BF5700', includeFontPadding: false, lineHeight: 14 },

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
    fontFamily: 'Inter_700Medium',
  },

  // RIGHT
  filterBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(191,87,0,0.08)',
  },
  filterIcon: { fontSize: 18 },
});