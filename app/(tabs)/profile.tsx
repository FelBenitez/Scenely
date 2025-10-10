// app/(tabs)/profile.tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Image, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); // public URL (if any)
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null); // picked file uri (not uploaded yet)

  const [availability, setAvailability] = useState<'checking' | 'available' | 'taken' | 'idle'>('idle');

  const normalized = useMemo(() => username.trim().toLowerCase(), [username]);
  const validFormat = USERNAME_RE.test(normalized);

  // Load my profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        Alert.alert('Error', 'Could not load profile');
      } else if (data) {
        setProfile(data as Profile);
        setUsername((data.username ?? ''));
        setFullName((data.full_name ?? ''));
        setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced username availability check (only if changed + valid)
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!profile) return;
      if (!normalized || !validFormat) { setAvailability('idle'); return; }
      if (normalized === (profile.username ?? '')) { setAvailability('idle'); return; }

      setAvailability('checking');
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalized)
        .neq('id', profile.id)
        .limit(1);

      if (!active) return;
      if (error) { setAvailability('idle'); return; }
      setAvailability((data?.length ?? 0) === 0 ? 'available' : 'taken');
    };

    const t = setTimeout(run, 400);
    return () => { active = false; clearTimeout(t); };
  }, [normalized, validFormat, profile]);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });
    if (!res.canceled) {
      setLocalAvatarUri(res.assets[0].uri);
    }
  };

  const uploadAvatarIfNeeded = async (userId: string): Promise<string | null> => {
    if (!localAvatarUri) return null;
    
    // Read the file as base64
    const response = await fetch(localAvatarUri);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const path = `${userId}/avatar.jpg`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, uint8Array, { 
        upsert: true, 
        contentType: 'image/jpeg' 
      });
      
    if (upErr) {
      console.warn('avatar upload error', upErr.message);
      throw new Error('Could not upload your photo.');
    }
    
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl ?? null;
  };

  const save = async () => {
    if (!profile) return;
    if (!validFormat) return Alert.alert('Username', 'Use 3–20 chars: a–z, 0–9, _, .');
    if (availability === 'taken') return Alert.alert('Username', 'That handle is taken.');

    try {
      setSaving(true);
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr || !user) throw new Error('Not signed in');

      const newAvatarUrl = await uploadAvatarIfNeeded(user.id);

      const update: any = {
        username: normalized,
        full_name: fullName.trim() || null,
      };
      if (newAvatarUrl) update.avatar_url = newAvatarUrl;

      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id);

      if (error) throw error;

      // reflect UI
      setAvatarUrl(newAvatarUrl ?? avatarUrl);
      setLocalAvatarUri(null);
      Alert.alert('Saved', 'Your profile was updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
  Alert.alert(
    'Delete account?',
    'This will permanently remove your account, posts, and profile from our system. You can sign up again later with the same email.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true);

            // call edge function to delete acount completely
            const { error: fnError } = await supabase.functions.invoke('delete-account', {
              body: {}, // function gets user ID from auth context
            });

            if (fnError) throw fnError;

            // sign out locally once delete is complete
            await supabase.auth.signOut();
            Alert.alert('Account deleted', 'Your account was permanently removed.');
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not delete account.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ],
  );
};

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Your Profile</Text>

      <View style={s.row}>
        <TouchableOpacity onPress={pickImage} style={s.avatarWrap}>
          {localAvatarUri ? (
            <Image source={{ uri: localAvatarUri }} style={s.avatar} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarPlaceholder]}>
              <Text style={{ fontWeight: '700' }}>Add</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={s.smallHint}>Tap to change photo</Text>
      </View>

      <Text style={s.label}>Username</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        placeholder="your_handle"
        style={s.input}
      />
      {username.length > 0 && (
        <Text style={s.meta}>
          {!validFormat
            ? 'Use 3–20 chars: a–z, 0–9, _, .'
            : availability === 'checking'
              ? 'Checking…'
              : availability === 'taken'
                ? 'Taken'
                : 'Looks good'}
        </Text>
      )}

      <Text style={s.label}>Full name (optional)</Text>
      <TextInput
        value={fullName}
        onChangeText={setFullName}
        placeholder="Bevo Longhorn"
        style={s.input}
      />

      <TouchableOpacity
        onPress={save}
        disabled={saving || !validFormat || availability === 'taken'}
        style={[s.primaryBtn, (saving || !validFormat || availability === 'taken') && { opacity: 0.6 }]}
      >
        <Text style={s.primaryText}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </TouchableOpacity>

      <View style={{ height: 16 }} />

      <TouchableOpacity onPress={signOut} style={s.secondaryBtn}>
        <Text style={s.secondaryText}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={deleteAccount} disabled={deleting} style={[s.dangerBtn, deleting && { opacity: 0.6 }]}>
        <Text style={s.dangerText}>{deleting ? 'Deleting…' : 'Delete my account'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, padding: 20, paddingTop: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatarWrap: { borderRadius: 44, overflow: 'hidden' },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  smallHint: { color: '#6b7280' },
  label: { fontWeight: '700', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, fontSize: 16 },
  meta: { marginTop: 6, color: '#6b7280' },
  primaryBtn: { marginTop: 18, padding: 14, backgroundColor: '#1976D2', borderRadius: 12 },
  primaryText: { color: 'white', fontWeight: '700', textAlign: 'center' },
  secondaryBtn: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 8 },
  secondaryText: { textAlign: 'center', fontWeight: '700' },
  dangerBtn: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ef4444', marginTop: 8 },
  dangerText: { textAlign: 'center', fontWeight: '700', color: '#ef4444' },
});