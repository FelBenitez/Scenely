// components/PostCard.jsx
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Heart, MessageCircle, MapPin } from 'lucide-react-native';
import { minutesLeftFor } from '../utils/ranking';

export default function PostCard({
  post,
  variant = 'tile', // 'tile' | 'list'
  onPress,
  onViewMap,
}) {
  if (!post) return null;

  const minsLeft = minutesLeftFor(post);
  const distance = post.distanceLabel || ''; // pass in precomputed distance string if you have it
  const dupe = post._dupeCount && post._dupeCount > 1;
  
  // Fallback avatar
  const avatarUrl = post.avatar_url || post.profiles?.avatar_url || 'https://placehold.co/60x60/e5e7eb/9ca3af';
  
  if (variant === 'list') {
  const heartCount = post.reactions || 0;
  const commentCount = post.comments || 0;
  const timeAgo = post.created_at
    ? (() => {
        const mins = Math.max(0, Math.floor((Date.now() - new Date(post.created_at)) / 60000));
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        return `${h}h`;
      })()
    : '';

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onPress?.(post)}
      style={styles.card}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <Image source={{ uri: avatarUrl }} style={styles.avatarLg} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.author}>
            {post.profiles?.username || 'Someone'}
          </Text>
          <Text numberOfLines={1} style={styles.metaRow}>
            <Text style={styles.metaDim}>{timeAgo} ago</Text>
            <Text>  ·  </Text>
            <Text style={styles.metaDim}>{distance || 'nearby'}</Text>
          </Text>
        </View>
        {/* tiny thumbnail if photo */}
        {post.photo_url ? (
          <Image source={{ uri: post.photo_url }} style={styles.thumb} />
        ) : null}
      </View>

      {/* Body */}
      {!!post.text && (
        <Text numberOfLines={2} style={styles.bodyText}>
          {post.text}
        </Text>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.metaPill}>
          <Heart
            size={16}
            color={post.likedByMe ? '#DC2626' : '#111'}
            fill={post.likedByMe ? '#DC2626' : 'transparent'}
          />
          <Text style={styles.countText}>{heartCount}</Text>
        </View>

        <View style={[styles.metaPill, { marginLeft: 12 }]}>
          <MessageCircle size={16} color="#111" />
          <Text style={styles.countText}>{commentCount}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onViewMap?.(post);
          }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View style={styles.metaPill}>
            <MapPin size={16} color="#6B7280" />
          </View>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

  // Tile variant
// Tile variant
return (
  <TouchableOpacity 
    activeOpacity={0.9} 
    onPress={() => onPress?.(post)} 
    style={styles.tile}
  >
    {post.photo_url ? (
      <>
        <Image 
          source={{ uri: post.photo_url }} 
          style={styles.photo}
          resizeMode="cover"
        />
        <View style={styles.tileBody}>
          <View style={styles.tileHeader}>
            <Image source={{ uri: avatarUrl }} style={styles.avatarSm} />
            <Text style={styles.miniMeta}>{minsLeft}m</Text>
          </View>
          <Text numberOfLines={2} style={styles.tileTitle}>
            {post.text || 'No caption'}
          </Text>
          {dupe && (
            <View style={styles.dupePill}>
              <Text style={styles.dupeText}>+{post._dupeCount - 1} similar</Text>
            </View>
          )}
        </View>
      </>
    ) : (
      // TEXT-ONLY TILE: let the text fill the block, footer at bottom
      <View style={styles.textTile}>
        <Text numberOfLines={6} style={styles.textOnlyTitle}>
          {post.text || 'No caption'}
        </Text>
        <View style={styles.textOnlyFooter}>
          <Image source={{ uri: avatarUrl }} style={styles.avatarSm} />
          <Text style={styles.miniMeta}>{minsLeft}m</Text>
        </View>
      </View>
    )}
  </TouchableOpacity>
);
}

const styles = StyleSheet.create({
  // List card (Feed)
  listCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 8,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarLg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eee',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  heartPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF1E8',
    borderRadius: 12,
  },
  heartText: {
    color: '#BF5700',
    fontWeight: '700',
    fontSize: 12,
  },
  textTile: {
  flex: 1,
  minHeight: 180,        // keeps grid rows even; try 180–200
  padding: 12,
  justifyContent: 'space-between',
  },
  // Tile (Bottom sheet grid)
  tile: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 12,
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEE',
    minWidth: 0, // Important for flex
  },
  photo: {
    width: '100%',
    height: 96,
  },
  photoFallback: {
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFallbackText: {
    fontSize: 32,
    opacity: 0.3,
  },
  tileBody: {
    padding: 10,
    gap: 6,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarSm: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#eee',
  },
  miniMeta: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    lineHeight: 18,
  },
  dupePill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  dupeText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
  },
  textOnlyBody: {
  padding: 12,
  gap: 8,
  minHeight: 150,            // gives it the tall “block” feel like the mock
  justifyContent: 'space-between',
  },
  textOnlyTitle: {
  fontSize: 18,
  lineHeight: 22,
  fontWeight: '700',
  color: '#111',
  },
  textOnlyFooter: {
  marginTop: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  },
  card: {
  backgroundColor: 'white',
  borderRadius: 18,
  padding: 12,
  marginHorizontal: 14,
  marginVertical: 8,
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: '#F1F5F9',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { fontSize: 15, fontWeight: '800', color: '#111' },
  metaRow: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  metaDim: { color: '#6B7280', fontWeight: '600' },
  thumb: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#eee' },
  bodyText: { marginTop: 8, fontSize: 15, color: '#111' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  footerPill: { fontWeight: '700', color: '#6B7280' },
  pinText: { fontSize: 16, color: '#6B7280' },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { fontWeight: '700', color: '#6B7280' },
});