// app/(tabs)/profile.tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch {}
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>My Profile</Text>

      {/* TODO: show username / avatar / my posts */}
      <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10 }}>
        <Text style={{ color: '#666' }}>Settings, legal, and account actions go here.</Text>
      </View>

      <TouchableOpacity
        onPress={signOut}
        style={{ backgroundColor: '#ef4444', padding: 12, borderRadius: 10, alignSelf: 'flex-start' }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}