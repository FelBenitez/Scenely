// app/(tabs)/profile.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { ThemedView } from '../../components/themed-view';
import { ThemedText } from '../../components/themed-text';
import { Colors } from '../../constants/theme';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import { usePostHog } from 'posthog-react-native';

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string | null;
};

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const BUG_REPORT_EMAIL = 'support@scenely.app'; // change to your real email


const getSupabaseProjectRef = () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  // SUPABASE_URL looks like "https://xxxxxx.supabase.co"
  const match = url.match(/^https?:\/\/(.*?)\./);
  return match?.[1] ?? null; // "xxxxxx"
};

const clearLocalStorageAndSecure = async () => {
  try {
    // Wipe all AsyncStorage keys
    await AsyncStorage.clear();

    // Wipe Supabase session from SecureStore
    const projectRef = getSupabaseProjectRef();
    if (projectRef) {
      const supabaseSessionKey = `sb-${projectRef}-auth-token`;
      await SecureStore.deleteItemAsync(supabaseSessionKey);
    }

    // If you ever store other secure keys, nuke them here too:
    // await SecureStore.deleteItemAsync('my-other-key');
  } catch (e) {
    console.warn('Error clearing local + secure storage', e);
  }
};


export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); // public URL
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null); // picked file uri
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const posthog = usePostHog();

  useEffect(() => {
    posthog?.screen('Profile');
  }, []);

  const [availability, setAvailability] =
    useState<'checking' | 'available' | 'taken' | 'idle'>('idle');

  // For "only show border on focus"
  const [focusedField, setFocusedField] =
    useState<'fullName' | 'username' | null>(null);


    // Feedback / bug report state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackImageUri, setFeedbackImageUri] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const [avatarRemoved, setAvatarRemoved] = useState(false);

  const normalized = useMemo(
    () => username.trim().toLowerCase(),
    [username],
  );
  const validFormat = USERNAME_RE.test(normalized);

  // load profile
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserEmail(user.email ?? null);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        Alert.alert('Error', 'Could not load profile.');
      } else if (data) {
        const p = data as Profile;
        setProfile(p);
        setUsername(p.username ?? '');
        setFullName(p.full_name ?? '');
        setAvatarUrl(p.avatar_url ?? null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // username availability (only when changed + valid)
  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!profile) return;
      if (!normalized || !validFormat) {
        setAvailability('idle');
        return;
      }
      const original = (profile.username ?? '').trim().toLowerCase();
      if (normalized === original) {
        setAvailability('idle');
        return;
      }

      setAvailability('checking');

      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalized)
        .neq('id', profile.id)
        .limit(1);

      if (!active) return;
      if (error) {
        setAvailability('idle');
        return;
      }

      setAvailability((data?.length ?? 0) === 0 ? 'available' : 'taken');
    };

    const t = setTimeout(run, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
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

  const handleAvatarEdit = () => {
  Alert.alert('Edit profile photo', 'Choose an action', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Remove photo',
      style: 'destructive',
      onPress: () => {
        setLocalAvatarUri(null);
        setAvatarUrl(null);
        setAvatarRemoved(true); // mark as removed so save() nulls it in DB
      },
    },
    {
      text: 'Choose from library',
      style: 'default',
      onPress: pickImage,
    },
  ]);
};


  const pickFeedbackImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });

    if (!res.canceled) {
      setFeedbackImageUri(res.assets[0].uri);
    }
  };

  const uploadFeedbackImageIfNeeded = async (userId: string): Promise<string | null> => {
    if (!feedbackImageUri) return null;

    const response = await fetch(feedbackImageUri);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Start path with userId so it matches the same RLS pattern as avatars
    const path = `${userId}/feedback-${Date.now()}.jpg`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, uint8Array, {
        upsert: false, // feedback images shouldn’t overwrite each other
        contentType: 'image/jpeg',
      });

    if (upErr) {
      console.warn('feedback screenshot upload error', upErr.message);
      throw new Error('Could not upload screenshot.');
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl ?? null;
  };

  const uploadAvatarIfNeeded = async (userId: string): Promise<string | null> => {
    if (!localAvatarUri) return null;

    const response = await fetch(localAvatarUri);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const path = `${userId}/avatar.jpg`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, uint8Array, {
        upsert: true,
        contentType: 'image/jpeg',
      });

    if (upErr) {
      console.warn('avatar upload error', upErr.message);
      throw new Error('Could not upload your photo.');
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl ?? null;
  };

  // --- change detection (for save button + "looks good") ---
  const originalUsername = (profile?.username ?? '').trim().toLowerCase();
  const originalFullName = (profile?.full_name ?? '').trim();

  const usernameChanged = normalized !== originalUsername;
  const fullNameChanged = fullName.trim() !== originalFullName;
const avatarChanged = !!localAvatarUri || avatarRemoved;

const hasChanges = usernameChanged || fullNameChanged || avatarChanged;

  const buildUsernameHelp = (): string | null => {
    if (!usernameChanged) return null; // only show helper when user has changed it

    if (!validFormat) return 'Use 3–20 characters: a–z, 0–9, _, .';
    if (availability === 'checking') return 'Checking…';
    if (availability === 'taken') return 'Taken';

    // either available or unchanged-but-valid (shouldn’t happen because of guard)
    return 'Looks good';
  };

  const usernameHelp = buildUsernameHelp();

  const save = async () => {
    if (!profile) return;
    if (!validFormat) {
      return Alert.alert(
        'Username',
        'Use 3–20 characters: a–z, 0–9, _, .',
      );
    }
    if (availability === 'taken') {
      return Alert.alert('Username', 'That handle is taken.');
    }
    if (!hasChanges) {
      setIsEditing(false); // Just exit edit mode
      return; 
    }

    try {
      setSaving(true);

      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();

      if (uErr || !user) throw new Error('Not signed in');

      const newAvatarUrl = await uploadAvatarIfNeeded(user.id);

      const update: any = {
        username: normalized,
        full_name: fullName.trim() || null,
      };

      // If user chose to remove avatar, explicitly null it out.
      // Otherwise, if there's a new uploaded avatar, set that.
      if (avatarRemoved) {
        update.avatar_url = null;
      } else if (newAvatarUrl) {
        update.avatar_url = newAvatarUrl;
      }

      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id);

      if (error) throw error;

      // reset "dirty" baseline
      setProfile((prev) =>
      prev
        ? {
            ...prev,
            username: normalized,
            full_name: fullName.trim() || null,
            avatar_url: avatarRemoved ? null : (newAvatarUrl ?? prev.avatar_url),
          }
        : prev,
    );

    setAvatarUrl(avatarRemoved ? null : (newAvatarUrl ?? avatarUrl));
    setLocalAvatarUri(null);
    setAvatarRemoved(false);

    setIsEditing(false);
      posthog?.capture('Profile Updated');
      Alert.alert('Saved', 'Your profile was updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };


  

  const signOut = async () => {
  try {
    await supabase.auth.signOut();
  } finally {
    await clearLocalStorageAndSecure();
  }
};

  const deleteAccount = async () => {
    Alert.alert(
      'Delete account?',
      'This will permanently remove your account, posts, and profile from Scenely. You can sign up again later with the same email.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);

              // Edge function handles full cleanup using auth context
              const { error: fnError } = await supabase.functions.invoke(
                'delete-account',
                { body: {} },
              );

              if (fnError) throw fnError;

              await supabase.auth.signOut();
              await clearLocalStorageAndSecure();

              Alert.alert(
                'Account deleted',
                'Your account was permanently removed.',
              );
            } catch (e: any) {
              Alert.alert(
                'Error',
                e.message ?? 'Could not delete account.',
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const submitFeedback = async () => {
    if (!feedbackMessage.trim()) {
      posthog?.capture('Bug Report Submitted', { hasImage: !!feedbackImageUri });
      return Alert.alert('Feedback', 'Tell us what went wrong first.');
    }

    try {
      setSubmittingFeedback(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('You need to be signed in to send feedback.');

      const screenshotUrl = await uploadFeedbackImageIfNeeded(user.id);

      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        email: userEmail,
        message: feedbackMessage.trim(),
        screenshot_url: screenshotUrl,
        meta: {
          platform: Platform.OS,
        },
      });

      if (error) throw error;

      setFeedbackMessage('');
      setFeedbackImageUri(null);
      setFeedbackOpen(false);

      Alert.alert('Thanks!', 'Your feedback was sent.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not send feedback.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  const trimmedName = fullName.trim();
  const displayName = trimmedName.length ? trimmedName : null;
  const displayUsername =
    normalized.length > 0 ? `@${normalized}` : 'Add a username';

  const disableSave =
    !hasChanges || saving || !validFormat || availability === 'taken';

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: 85 + insets.bottom },
        ]}
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={true}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* HEADER */}
        <View style={styles.header}>
            <TouchableOpacity 
            onPress={isEditing ? handleAvatarEdit : undefined} 
            activeOpacity={isEditing ? 0.7 : 1}
            style={styles.avatarWrapper}
          >
            {localAvatarUri ? (
              <Image source={{ uri: localAvatarUri }} style={styles.avatar} />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={36} color="#9CA3AF" />
              </View>
            )}
            
            {/* ONLY SHOW BADGE IF EDITING */}
            {isEditing && (
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            )}
          </TouchableOpacity>


  {displayName && (
  <ThemedText type="subtitle" style={styles.nameText}>
    {displayName}
  </ThemedText>
)}

  <ThemedText style={styles.usernameText}>{displayUsername}</ThemedText>

  {userEmail ? (
    <ThemedText style={styles.emailText}>{userEmail}</ThemedText>
  ) : null}
</View>

        {/* ACCOUNT SECTION HEADER WITH EDIT BUTTON */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 4 }}>
          <SectionLabel title="Account" />
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
            <ThemedText style={{ color: '#F97316', fontWeight: '600', fontSize: 14 }}>
              {isEditing ? 'Cancel' : 'Edit'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.fieldLabel}>Full name</ThemedText>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            editable={isEditing} // <--- Only editable in mode
            placeholder="Bevo Longhorn"
            placeholderTextColor="#9CA3AF"
            style={[
              // Toggle styles based on mode
              isEditing ? styles.input : styles.inputTextOnly,
              isEditing && focusedField === 'fullName' && styles.inputFocused,
            ]}
            onFocus={() => setFocusedField('fullName')}
            onBlur={() => setFocusedField(null)}
          />

          <ThemedText style={[styles.fieldLabel, { marginTop: 16 }]}>
            Username
          </ThemedText>
          <TextInput
            value={username}
            onChangeText={setUsername}
            editable={isEditing}
            autoCapitalize="none"
            placeholder="your_handle"
            placeholderTextColor="#9CA3AF"
            style={[
              isEditing ? styles.input : styles.inputTextOnly,
              isEditing && focusedField === 'username' && styles.inputFocused,
            ]}
            onFocus={() => setFocusedField('username')}
            onBlur={() => setFocusedField(null)}
          />

          {/* Only show helpers and save button when editing */}
          {isEditing && usernameHelp && (
            <ThemedText style={styles.metaText}>{usernameHelp}</ThemedText>
          )}

          {isEditing && hasChanges && (
            <TouchableOpacity
              onPress={save}
              disabled={disableSave}
              style={[
                styles.primaryBtn,
                disableSave && { opacity: 0.6 },
              ]}
            >
              <ThemedText style={styles.primaryBtnText}>
                {saving ? 'Saving…' : 'Save changes'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>


        {/* SUPPORT SECTION */}
                {/* SUPPORT SECTION */}
        <SectionLabel title="Support" />

        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => setFeedbackOpen((open) => !open)}
            style={styles.rowButton}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="bug-outline"
                size={20}
                color={Colors.light.icon}
              />
              <ThemedText style={styles.rowText}>Report a bug</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          {feedbackOpen && (
            <View style={styles.feedbackForm}>
              <TextInput
                value={feedbackMessage}
                onChangeText={setFeedbackMessage}
                placeholder="What went wrong? Any details help a lot."
                placeholderTextColor="#9CA3AF"
                multiline
                style={styles.feedbackInput}
              />

              <View style={styles.feedbackRow}>
                <TouchableOpacity
                  onPress={pickFeedbackImage}
                  style={styles.feedbackAttachBtn}
                >
                  <Ionicons name="image-outline" size={18} color={Colors.light.icon} />
                  <ThemedText style={styles.feedbackAttachText}>
                    {feedbackImageUri ? 'Change screenshot' : 'Add screenshot'}
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={submitFeedback}
                  disabled={submittingFeedback || !feedbackMessage.trim()}
                  style={[
                    styles.feedbackSubmitBtn,
                    (submittingFeedback || !feedbackMessage.trim()) && { opacity: 0.6 },
                  ]}
                >
                  <ThemedText style={styles.feedbackSubmitText}>
                    {submittingFeedback ? 'Sending…' : 'Send'}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {feedbackImageUri && (
                <Image
                  source={{ uri: feedbackImageUri }}
                  style={styles.feedbackImagePreview}
                />
              )}
            </View>
          )}
        </View>

        {/* BETA WALKTHROUGH SECTION */}
        <SectionLabel title="Beta walkthrough" />

        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => router.push('/beta-intro?fromProfile=1')}
            style={styles.rowButton}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="school-outline"
                size={20}
                color={Colors.light.icon}
              />
              <ThemedText style={styles.rowText}>
                Replay beta instructions
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          <ThemedText style={styles.metaText}>
            Re-read what this beta is for and how to help test Scenely.
          </ThemedText>
        </View>


        {/* SESSION SECTION */}
        <SectionLabel title="Session" />

        <View style={styles.card}>
          <TouchableOpacity onPress={signOut} style={styles.rowButton}>
            <View style={styles.rowLeft}>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={Colors.light.icon}
              />
              <ThemedText style={styles.rowText}>Sign out</ThemedText>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>

          
        


        {/* DANGER ZONE */}
        <SectionLabel title="Danger zone" />

        <View style={styles.card}>
          <TouchableOpacity
            onPress={deleteAccount}
            disabled={deleting}
            style={[
              styles.dangerButton,
              deleting && { opacity: 0.6 },
            ]}
          >
            <ThemedText style={styles.dangerButtonText}>
              {deleting ? 'Deleting…' : 'Delete my account'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* FOOTER */}
        <ThemedText style={styles.footerText}>
          Scenely v1.0{'\n'}Built at UT Austin
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <ThemedText style={styles.sectionLabel}>
      {title.toUpperCase()}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
    avatarWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameText: {
    marginTop: 2,
    fontWeight: '800',
  },
  usernameText: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B7280',
  },
  emailText: {
    marginTop: 4,
    fontSize: 13,
    color: '#9CA3AF',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  card: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  inputFocused: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  metaText: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
  },
  primaryBtn: {
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dangerButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
  footerText: {
    marginTop: 24,
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
  },

    feedbackForm: {
    marginTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  feedbackInput: {
    minHeight: 80,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  feedbackAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    flexShrink: 1,
  },
  feedbackAttachText: {
    marginLeft: 6,
    fontSize: 13,
  },
  feedbackSubmitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FF6B35',
  },
  feedbackSubmitText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  feedbackImagePreview: {
    marginTop: 10,
    height: 120,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  nameHintText: {
  marginTop: 4,
  fontSize: 13,
  color: '#9CA3AF',
},
inputTextOnly: {
    borderWidth: 0, 
    paddingHorizontal: 0, paddingVertical: 4,
    fontSize: 16, backgroundColor: 'transparent',
    color: '#111', fontWeight: '500'
  },
});