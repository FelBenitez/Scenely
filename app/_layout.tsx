// app/_layout.tsx
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Profile = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; onboarded: boolean };

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  // 1) load session + subscribe
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // 2) fetch my profile when we have a session
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

  // 3) routing guard
  useEffect(() => {
    if (session === undefined || profile === undefined) return; // still loading
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

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
    if (inAuth || inOnboarding) router.replace('/(tabs)/map');
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