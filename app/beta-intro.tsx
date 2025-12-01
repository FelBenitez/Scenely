// app/beta-intro.tsx
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { ThemedView } from '../components/themed-view';
import { ThemedText } from '../components/themed-text';
import { Colors } from '../constants/theme';

const BETA_KEY = 'scenely_beta_intro_v1';

export default function BetaIntroScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    try {
      setSaving(true);
      await AsyncStorage.setItem(BETA_KEY, '1');
    } catch {
      // even if it fails, just continue
    } finally {
      setSaving(false);
      router.replace('/(tabs)/map');
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
      >
        {/* PANEL 1 — WELCOME */}
        <View style={styles.headerBlock}>
          <ThemedText style={styles.eyebrow}>BETA TEST</ThemedText>
          <ThemedText type="title" style={styles.title}>
            🧡 Welcome to Scenely Beta!
          </ThemedText>
          <ThemedText style={styles.body}>
            You’re one of the first 25 UT students helping shape the app before
            it goes public. Your job is simple: use Scenely naturally, post
            scenes, check the map, and submit a report when something feels off.
          </ThemedText>
        </View>

        {/* PANEL 2 — WHAT TO EXPECT */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>
            What to expect during the beta
          </ThemedText>
          <ThemedText style={styles.body}>
            This version is focused on the core experience: posting scenes and
            discovering what’s happening around campus. A few things missing things that will
            improve in upcoming builds:
          </ThemedText>

          <View style={styles.bulletBlock}>
            <Bullet title="Map pins">
              When you zoom out, you will see simpler red placeholder icons. This is an optimization still in progress. Zooming
              in reveals the full custom pins.
            </Bullet>

            <Bullet title="Profile page">
              You can update your name, handle, and send bug reports. More
              personalization is coming soon.
            </Bullet>

            <Bullet title="Post duration">
              Posts reset every 4 hours and will never be permanent.
              Treat everything as temporary.
            </Bullet>
          </View>
        </View>

        {/* PANEL 3 — MISSION */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Your 3-step mission</ThemedText>

          <Bullet numbered="1" title="Post regularly">
            Tap <ThemedText style={styles.inlineStrong}>+</ThemedText> and feel free to post whatever and however often. The more you post and find bugs, the more data to improve the app.
          </Bullet>

          <Bullet numbered="2" title="Explore the map">
            Move around, tap clusters, and see what others are posting. Try to break it!
          </Bullet>

          <Bullet numbered="3" title="Report bugs in the app">
            Go to{' '}
            <ThemedText style={styles.inlineStrong}>
              Profile → Support → Report a Bug
            </ThemedText>
            . Add a short description and a screenshot if something looks off.
          </Bullet>
        </View>

        <ThemedText style={styles.helperText}>
          You can always replay this screen later from{' '}
          <ThemedText style={styles.inlineStrong}>
            Profile → Support → Beta tester guide
          </ThemedText>
          .
        </ThemedText>

        {/* CTA */}
        <TouchableOpacity
          onPress={handleContinue}
          disabled={saving}
          style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
        >
          <ThemedText style={styles.primaryBtnText}>
            {saving ? 'Loading…' : "Let's start testing"}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

function Bullet({
  title,
  children,
  numbered,
}: {
  title: string;
  children: React.ReactNode;
  numbered?: string;
}) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletIcon}>
        <ThemedText style={styles.bulletIconText}>
          {numbered ?? '•'}
        </ThemedText>
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.bulletTitle}>{title}</ThemedText>
        <ThemedText style={styles.bulletBody}>{children}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  headerBlock: {
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  title: {
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
  card: {
    marginTop: 14,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  bulletBlock: {
    marginTop: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 10,
  },
  bulletIcon: {
    width: 22,
    alignItems: 'center',
    paddingTop: 2,
  },
  bulletIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.tint ?? '#FF6B35',
  },
  bulletTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  bulletBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
  },
  inlineStrong: {
    fontWeight: '600',
  },
  helperText: {
    marginTop: 14,
    fontSize: 13,
    color: '#6B7280',
  },
  primaryBtn: {
    marginTop: 18,
    marginBottom: 6,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});