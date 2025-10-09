import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  // Load session once, then subscribe
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Redirect guard
  useEffect(() => {
  if (session === undefined) return;

  const inAuth = segments[0] === '(auth)';

  if (!session && !inAuth) {
    router.replace({ pathname: '/(auth)/sign-in' });   
  } else if (session && inAuth) {
    router.replace({ pathname: '/(tabs)' });          
  }
}, [session, segments, router]);

  if (session === undefined) return null; // small splash-free gate

  return (
    <ThemeProvider value={DefaultTheme /* or DarkTheme via your hook */}>
      <Slot />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}