// components/ui/ComposerSheet.jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

let ImagePicker;
try { ImagePicker = require('expo-image-picker'); } catch {}

const CATS = [
  { key: 'talk',  label: 'Talk',     tint: '#0EA5E9', emoji: '💬' },
  { key: 'here',  label: "I'm here", tint: '#22C55E', emoji: '📍' },
  { key: 'event', label: 'Event',    tint: '#7C3AED', emoji: '🎉' },
  { key: 'freebies', label: 'Freebies', tint: '#FF8A4C', emoji: '🍕' },
];

export default function ComposerSheet({ visible, onClose, onSubmit }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('talk'); // default to Talk
  const [photo, setPhoto] = useState(null);
  const cat = CATS.find(c => c.key === category) || CATS[0];
  const canSubmit = text.trim().length > 0;

  async function pickPhoto() {
    if (!ImagePicker) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.8,
      selectionLimit: 1,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setPhoto(res.assets[0].uri);
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit?.({ text: trimmed, category, photoUri: photo });
    setText('');
    setPhoto(null);
  }

  function handleCategorySelect(key) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCategory(key);
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {/* Dim/blurred backdrop */}
      <BlurView intensity={20} tint="light" style={styles.backdrop}>
        {/* Tap outside to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Keyboard-friendly centered card */}
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: 'height' })}
          keyboardVerticalOffset={Platform.select({ ios: 60, android: 0 })}
          style={styles.avoider}
        >
          <View style={styles.sheet}>
            <Text style={styles.title}>Create a Post</Text>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.chips}>
                {CATS.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    activeOpacity={0.85}
                    onPress={() => handleCategorySelect(c.key)}
                    style={[
                      styles.chip,
                      {
                        borderColor: c.tint,
                        backgroundColor: category === c.key ? `${c.tint}22` : '#fff',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16, marginRight: 6 }}>{c.emoji}</Text>
                    <Text style={[styles.chipText, { color: c.tint }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputWrap}>
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
                <Text style={{ fontSize: 16 }}>📷</Text>
                <Text style={styles.photoText}>
                  {photo ? '1 photo selected' : 'Add Photo'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.expireText}>Expires in 4 hours</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={submit}
                disabled={!canSubmit}
                style={[
                  styles.cta,
                  {
                    backgroundColor: canSubmit ? cat.tint : '#D1D5DB',
                    opacity: canSubmit ? 1 : 0.5,
                  },
                ]}
              >
                <Text style={styles.ctaText}>Post</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={styles.cancel}>
                <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center', // center on screen (not bottom)
    alignItems: 'center',
    padding: 16,
  },
  avoider: {
    width: '100%',
    alignItems: 'center',
  },
  sheet: {
    width: '92%',
    maxWidth: 460,
    minHeight: 420,  
    maxHeight: 640,                    // prevents overflow on small phones
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
    textAlign: 'left',
  },
  content: {
    paddingBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: { fontWeight: '700' },
  inputWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
    position: 'relative',
  },
  input: {
    minHeight: 120,              
    padding: 12,
    paddingBottom: 28,
    fontSize: 16,
    color: '#111',
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 11,
    color: '#9CA3AF',
  },
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
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancel: { marginTop: 8, alignItems: 'center' },
});