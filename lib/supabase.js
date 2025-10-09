// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto'; // fixes URL/atob in RN

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,      // persist to device storage (not memory)
    autoRefreshToken: true,     // refresh in background
    persistSession: true,       // survive reloads/restarts
    detectSessionInUrl: false,  // RN/Expo: no web URL parsing
  },
});