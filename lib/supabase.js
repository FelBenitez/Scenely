// lib/supabase.js (or .ts)
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto'; // fixes URL/atob in RN

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Adapter so Supabase can use expo-secure-store like AsyncStorage
const SecureStoreAdapter = {
  getItem: (key) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key, value) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key) => {
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in Keychain / Keystore instead of plain AsyncStorage
    storage: SecureStoreAdapter,
    autoRefreshToken: true,     // refresh in background
    persistSession: true,       // survive reloads/restarts
    detectSessionInUrl: false,  // RN/Expo: no web URL parsing
  },
});