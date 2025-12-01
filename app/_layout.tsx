// app/_layout.tsx
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';
import { PostHogProvider } from 'posthog-react-native';


const posthog = new PostHog(
  'phc_SCkpvo9Pe1ibilOnak7kvwebf260ofH6SpxV6xxmIg8', // 1. API Key string first
  {
    host: 'https://us.i.posthog.com', // 2. Options object second
  }
);


Sentry.init({
  dsn: 'https://e309fcb9c1d938df115382bef092439c@o4510458188005376.ingest.us.sentry.io/4510458190495744',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

type Profile = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; onboarded: boolean };

export default Sentry.wrap(function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

// identify user in PostHog + Sentry
useEffect(() => {
    if (session?.user?.id) {
      // Link analytics to the logged-in user
      posthog.identify(session.user.id, { email: session.user.email ?? null});
      Sentry.setUser({ id: session.user.id, email: session.user.email });
    } else {
      posthog.reset();
      Sentry.setUser(null);
    }
  }, [session]);


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
    <PostHogProvider client={posthog}>
    <ThemeProvider value={DefaultTheme}>
      <Slot />
      <StatusBar style="auto" />
    </ThemeProvider>
    </PostHogProvider>
  );
});