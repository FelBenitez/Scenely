// app/_layout.tsx
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Profile = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; onboarded: boolean };

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

useEffect(() => {
  // don’t open a realtime socket if not signed in or already onboarded to not keep streaming the data
  if (!session?.user?.id) return;
  if (profile?.onboarded) return;

  const ch = supabase
    .channel('profiles-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${session.user.id}`,
      },
      (payload) => {
        setProfile((prev) => ({ ...(prev ?? {} as any), ...(payload.new as any) }));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}, [session?.user?.id, profile?.onboarded]);

  // load session + subscribe
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // fetch my profile when we have a session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session) { setProfile(null); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, onboarded')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled) setProfile(error ? null : (data as Profile));
    })();
    return () => { cancelled = true; };
  }, [session]);

  // routing guard
    // routing guard
  useEffect(() => {
    if (session === undefined || profile === undefined) return; // still loading

    const rootSegment = segments[0];
    const inAuth = rootSegment === '(auth)';
    const inOnboarding = rootSegment === '(onboarding)';
    const inBetaIntro = rootSegment === 'beta-intro';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }

    // session exists
    if (!profile?.onboarded) {
      if (!inOnboarding) router.replace('/(onboarding)/complete-profile');
      return;
    }

    // session + onboarded
    (async () => {
      const betaSeen = await AsyncStorage.getItem('scenely_beta_intro_v1');

      // First time seeing this build → send to beta intro
      if (!betaSeen && !inBetaIntro) {
        router.replace('/beta-intro');
        return;
      }

      // If beta already seen and user somehow ends up in auth/onboarding/beta, push to tabs
      if (betaSeen && (inAuth || inOnboarding)) {
        router.replace('/(tabs)/map');
      }
    })();
  }, [session, profile, segments, router]);

  // Minimal splash gate
  if (session === undefined || profile === undefined) return null;

  return (
    <ThemeProvider value={DefaultTheme}>
      <Slot />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}