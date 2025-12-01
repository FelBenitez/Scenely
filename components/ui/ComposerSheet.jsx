import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, Pressable, 
  KeyboardAvoidingView, Platform, Animated, Easing 
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { MessageCircle, MapPin, Calendar, Pizza, Camera } from 'lucide-react-native'; 
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import usePressScale from '../../hooks/usePressScale';
import { usePostHog } from 'posthog-react-native';

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

let ImagePicker; 
try { ImagePicker = require('expo-image-picker'); } catch {}

const CATS = [
  { key: 'talk',     label: 'Talk',     tint: '#0EA5E9', Icon: MessageCircle },
  { key: 'here',     label: "I'm here", tint: '#22C55E', Icon: MapPin },
  { key: 'event',    label: 'Event',    tint: '#7C3AED', Icon: Calendar },
  { key: 'freebies', label: 'Freebies', tint: '#FF8A4C', Icon: Pizza },
];

export default function ComposerSheet({ visible, onClose, onSubmit }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [category, setCategory] = useState(CATS[0].key);
  const [photo, setPhoto] = useState(null);
  const cat = CATS.find(c => c.key === category) || CATS[0];
  const canSubmit = text.trim().length > 0;

  const posthog = usePostHog();

  useEffect(() => {
    if (visible) {
      setCategory(CATS[0].key);
    }
  }, [visible]);

  const [mounted, setMounted] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;
  const { scale, pressIn, pressOut, reset } = usePressScale(0.96);

  useEffect(() => {
    reset(); 
  }, [visible, reset]);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      backdrop.setValue(0);
      translateY.setValue(40);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 40, duration: 140, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible, mounted]);

  async function pickPhoto() {
    if (!ImagePicker) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true, quality: 0.8, selectionLimit: 1,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setPhoto(res.assets[0].uri);
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    posthog?.capture('Post Created', { category: category, hasPhoto: !!photo });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit?.({ text: trimmed, category, photoUri: photo });
    setText(''); 
    setPhoto(null);
  }

  function handleCategorySelect(key) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCategory(key);
  }

  const requestClose = () => {
    onClose?.();
  };

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={requestClose}>
      
      <AnimatedBlur intensity={20} tint="light" style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />

        {/* --- KEY CHANGE START --- */}
        {/* We wrap the Sheet in KeyboardAvoidingView. 
            When keyboard opens, this view shrinks, pushing the centered sheet up. */}
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kbContent}
          pointerEvents="box-none" // Lets touches pass through to the backdrop if clicking outside
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <Text style={styles.title}>Create a Post</Text>

            <View style={styles.chipsRow}>
              {CATS.map(c => {
                const Selected = category === c.key;
                const IconComp = c.Icon;
                return (
                  <TouchableOpacity
                    key={c.key}
                    activeOpacity={0.85}
                    onPress={() => handleCategorySelect(c.key)}
                    style={[
                      styles.chipVertical,
                      { borderColor: c.tint, backgroundColor: Selected ? `${c.tint}22` : '#fff' },
                    ]}
                  >
                    <IconComp size={22} color={c.tint} strokeWidth={2.4} />
                    <Text style={[styles.chipLabel, { color: c.tint }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.inputWrap, { backgroundColor: `${cat.tint}15` }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="What's happening near you?"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                multiline
                maxLength={160}
                autoFocus
              />
              <Text style={styles.charCount}>{text.length}/160</Text>
            </View>

            <TouchableOpacity style={styles.photoRow} onPress={pickPhoto}>
              <Camera size={20} color="#111" strokeWidth={2.3} />
              <Text style={styles.photoText}>{photo ? '1 photo selected' : 'Add Photo'}</Text>
            </TouchableOpacity>

            <Text style={styles.expireText}>Expires in 4 hours</Text>

            <TouchableOpacity
              activeOpacity={0.9}
              onPressIn={pressIn}
              onPressOut={pressOut}
              onPress={submit}
              disabled={!canSubmit}
            >
              <Animated.View
                style={[
                  styles.cta,
                  { 
                    transform: [{ scale }], 
                    backgroundColor: canSubmit ? cat.tint : '#D1D5DB',
                    opacity: canSubmit ? 1 : 0.5
                  }
                ]}
              >
                <Text style={styles.ctaText}>Post</Text>
              </Animated.View>
            </TouchableOpacity>

            <TouchableOpacity onPress={requestClose} style={styles.cancel}>
              <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
        {/* --- KEY CHANGE END --- */}

      </AnimatedBlur>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Removed justifyContent: 'center' from here, moved to kbContent
  backdrop: { flex: 1 }, 

  // This handles the centering AND the keyboard push
  kbContent: {
    flex: 1,
    justifyContent: 'center', 
    alignItems: 'center',
    width: '100%',
  },

  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    paddingBottom: 22,
    minHeight: 440,
    width: '92%',
    maxWidth: 560,
    // alignSelf: 'center' is handled by kbContent's alignItems
    marginTop: 40,
  },

  title: { 
    fontSize: 24, 
    fontWeight: '800', 
    marginBottom: 16, 
    marginTop: 6, 
    color: '#111', 
    textAlign: 'center' 
  },

  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },

  chipVertical: {
    flexGrow: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 66,
  },

  chipLabel: { fontWeight: '700', fontSize: 12 },

  inputWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    position: 'relative',
  },
  input: { minHeight: 80, padding: 12, paddingBottom: 28, fontSize: 16, color: '#111' },
  charCount: { position: 'absolute', bottom: 8, right: 12, fontSize: 11, color: '#9CA3AF' },

  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  photoText: { color: '#111', fontWeight: '600' },

  expireText: { color: '#6B7280', fontSize: 12, marginTop: 2, marginBottom: 10 },

  cta: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 20 },

  cancel: { marginTop: 8, alignItems: 'center' },
});