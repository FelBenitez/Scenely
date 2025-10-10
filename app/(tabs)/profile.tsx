import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ProfileTab() {
  const [me, setMe] = useState<{ username: string | null; full_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      setMe(data ?? null);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    Alert.alert('Signed out');
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 12 }}>My Profile</Text>
      {me?.avatar_url ? <Image source={{ uri: me.avatar_url }} style={{ width: 64, height: 64, borderRadius: 32 }} /> : null}
      <Text style={{ marginTop: 8 }}>@{me?.username ?? '—'}</Text>
      <Text style={{ color: '#666' }}>{me?.full_name ?? ''}</Text>

      <TouchableOpacity onPress={signOut} style={{ marginTop: 24, padding: 12, backgroundColor: '#eee', borderRadius: 10 }}>
        <Text>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}