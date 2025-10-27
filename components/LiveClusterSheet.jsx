// components/LiveClusterSheet.jsx
import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, Image } from 'react-native';

function fmtAgo(ts) {
  if (!ts) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ago`;
}

export default function LiveClusterSheet({
  visible,
  group, // { lat, lng, members: [...] }
  onClose,
  onCenterOnUser, // (u) => void
}) {
  const members = group?.members || [];
  const dataset = useMemo(() => {
    return members
      .slice()
      .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());
  }, [members]);

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>People here · {members.length}</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Text style={styles.closeTxt}>×</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={dataset}
            keyExtractor={(item) => String(item.user_id)}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={{ padding: 14 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onCenterOnUser?.(item)}
                style={styles.row}
                activeOpacity={0.8}
              >
                <Image
                  source={ item.avatar_url ? { uri: item.avatar_url } : undefined }
                  style={styles.avatar}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.username || 'User'}</Text>
                  <Text style={styles.sub}>{fmtAgo(item.last_seen)}</Text>
                </View>
                <Text style={styles.viewTxt}>View</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  header: { padding: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  close: { position: 'absolute', right: 6, top: 2, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 28, color: '#6B7280', marginTop: -4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 12,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', marginRight: 10 },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  viewTxt: { fontSize: 13, color: '#2563EB', fontWeight: '700' },
});