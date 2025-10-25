// components/FeedTopBar.jsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFonts, Inter_700Bold } from '@expo-google-fonts/inter';

/**
 * @param {{
 *   onlineCount?: number,
 *   tab: 'Top' | 'New',
 *   onChangeTab: (t: 'Top' | 'New') => void
 * }} props
 */
export default function FeedTopBar({ onlineCount, tab, onChangeTab }) {
  const [fontsLoaded] = useFonts({ Inter_700Bold });
  if (!fontsLoaded) return null;

  return (
    <View style={styles.header}>
      {/* Row: logo (left) + online (right) */}
      <View style={styles.topRow}>
        <Text style={styles.logo}>Scenely</Text>
        {typeof onlineCount === 'number' && (
          <View style={styles.badge}>
            <Feather name="users" size={13} color="#BF5700" style={{ marginRight: 4 }} />
            <Text style={styles.badgeText}>{onlineCount}</Text>
          </View>
        )}
      </View>

      {/* Segmented control (centered) */}
      <View style={styles.segmentWrap}>
        {(['Top', 'New']).map((t) => {
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => onChangeTab(t)}
              activeOpacity={0.9}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    fontSize: 25,
    fontWeight: '700',
    color: '#BF5700',
    letterSpacing: -0.5,
    fontFamily: 'Inter_700Bold',
  },
  badge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(191,87,0,0.12)',
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#BF5700', lineHeight: 14 },
  segmentWrap: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    padding: 4,
    width: 280,
    height: 42,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#BF5700',
  },
  segmentLabel: {
    fontWeight: '800',
    color: '#6B7280',
    fontSize: 15,
  },
  segmentLabelActive: {
    color: '#FFFFFF',
  },
});