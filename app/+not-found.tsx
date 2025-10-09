// app/+not-found.tsx
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function NotFoundScreen() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  // Cast to the expected Href type to silence TS safely
  const target = authed ? '/(tabs)' : '/auth/sign-in';
  return <Redirect href={target as any} />;
}