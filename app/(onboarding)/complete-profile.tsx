// app/(onboarding)/complete-profile.tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Image, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export default function CompleteProfile() {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  const normalized = useMemo(() => username.trim().toLowerCase(), [username]);
  const validFormat = USERNAME_RE.test(normalized);

  // Debounced username availability check
  useEffect(() => {
    let ok = true;
    const t = setTimeout(async () => {
      setAvailable(null);
      if (!validFormat) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalized)
        .neq('id', user.id)
        .limit(1);

      if (!ok) return;
      if (error) { setAvailable(null); return; }
      setAvailable((data?.length ?? 0) === 0);
    }, 400);
    return () => { ok = false; clearTimeout(t); };
  }, [normalized, validFormat]);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
    });
    if (!res.canceled) {
      setAvatarUri(res.assets[0].uri);
    }
  };

  // Use a RN file object
  const uploadAvatarIfAny = async (userId: string): Promise<string | null> => {
    if (!avatarUri) return null;

    // Try to preserve extension; default to jpg
    const ext = (avatarUri.split('.').pop() || 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const path = `${userId}/avatar.${ext}`;

    const file = {
      uri: avatarUri,
      name: `avatar.${ext}`,
      type: mime,
    } as any;

    const { error } = await supabase
      .storage
      .from('avatars') // make sure this bucket exists (public for MVP)
      .upload(path, file, { upsert: true });

    if (error) {
      console.warn('avatar upload error', error.message);
      return null;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl ?? null;
  };

  const submit = async () => {
    if (!validFormat) return Alert.alert('Username', 'Use 3–20 chars: a–z, 0–9, _, .');
    if (available === false) return Alert.alert('Username', 'That handle is taken.');

    try {
      setLoading(true);
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr || !user) throw new Error('Not signed in');

      const avatarUrl = await uploadAvatarIfAny(user.id);

      const { error } = await supabase
        .from('profiles')
        .update({
          username: normalized,
          full_name: fullName.trim() || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          onboarded: true,
        })
        .eq('id', user.id);

      if (error) throw error;
      // success, your root layout will route to /(tabs)/feed
    } catch (e: any) {
      Alert.alert('Couldn’t finish profile', e.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  const canContinue = validFormat && available !== false && !loading;

  return (
    <View style={s.container}>
      <Text style={s.title}>Set up your profile</Text>
      <Text style={s.hint}>Pick a handle and (optionally) add your name & photo.</Text>

      <Text style={s.label}>Username *</Text>
      <TextInput
        placeholder="bevo_longhorn"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
        style={s.input}
      />
      {normalized.length > 0 && (
        <Text style={s.meta}>
          {validFormat
            ? available === null
              ? 'Checking availability…'
              : available
                ? 'Available'
                : 'Taken'
            : 'Use 3–20 chars: a–z, 0–9, _, .'}
        </Text>
      )}

      <Text style={s.label}>Full name (optional)</Text>
      <TextInput
        placeholder="Bevo Longhorn"
        value={fullName}
        onChangeText={setFullName}
        style={s.input}
      />

      <Text style={s.label}>Avatar (optional)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={pickImage} style={s.secondaryBtn}>
          <Text>Choose Photo</Text>
        </TouchableOpacity>
        {avatarUri ? <Image source={{ uri: avatarUri }} style={s.avatar} /> : null}
      </View>

      <TouchableOpacity
        onPress={submit}
        disabled={!canContinue}
        style={[s.primaryBtn, !canContinue && { opacity: 0.6 }]}
      >
        <Text style={s.primaryText}>{loading ? 'Saving…' : 'Continue'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  hint: { color: '#666', marginBottom: 16 },
  label: { fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, fontSize: 16 },
  meta: { marginTop: 6, color: '#666' },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  primaryBtn: { marginTop: 22, padding: 14, backgroundColor: '#1976D2', borderRadius: 12 },
  primaryText: { color: 'white', fontWeight: '700', textAlign: 'center' },
});