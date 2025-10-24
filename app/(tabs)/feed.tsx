// app/(tabs)/feed.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ListRenderItem } from 'react-native';
import PostCard from '../../components/PostCard';
import { rankTop, rankNew, deDupeSimilar } from '../../utils/ranking';
import { supabase } from '../../lib/supabase';

type Profile = {
  avatar_url?: string | null;
  username?: string | null;
};

export type Post = {
  id: string | number;
  text?: string | null;
  lat?: number | null;
  lng?: number | null;
  created_at: string;
  expires_at?: string | null;
  user_id?: string | null;
  photo_url?: string | null;
  reactions?: number | null;
  comments?: number | null;
  profiles?: Profile;
  // client-side convenience fields:
  avatar_url?: string | null;
  distanceLabel?: string;
  _dupeCount?: number;
};

const FeedTab: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<'Top' | 'New'>('Top');
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = useCallback(async () => {
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('posts')
      .select(
        'id, text, lat, lng, created_at, expires_at, user_id, photo_url, reactions, comments, profiles:user_id(avatar_url, username)'
      )
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('feed fetch error:', error.message);
      return;
    }

    const normalized: Post[] =
      (data as Post[] | null)?.map((p) => ({
        ...p,
        avatar_url: p?.profiles?.avatar_url ?? null,
      })) ?? [];

    setPosts(normalized);
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const dataset = useMemo(() => {
    const base = tab === 'New' ? rankNew(posts) : rankTop(posts);
    return deDupeSimilar(base) as Post[];
  }, [posts, tab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPosts();
    } finally {
      setRefreshing(false);
    }
  }, [fetchPosts]);

  const renderItem: ListRenderItem<Post> = ({ item }) => (
    <PostCard
      post={item}
      variant="list"
      onPress={() => {
        /* open PostSheet like your Map tab does */
      }}
      onViewMap={() => {
        /* switch to Map tab and recenter */
      }}
    />
  );

  return (
    <View style={styles.container}>
      {/* Simple Top/New toggle */}
      <View style={styles.feedTabs}>
        {(['Top', 'New'] as const).map((t) => (
          <Text
            key={t}
            onPress={() => setTab(t)}
            style={[styles.feedTab, tab === t && styles.feedTabActive]}
          >
            {t}
          </Text>
        ))}
      </View>

      <FlatList
        data={dataset}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </View>
  );
};

export default FeedTab;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  feedTabs: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: 'white',
  },
  feedTab: { fontSize: 16, color: '#6B7280', fontWeight: '800' },
  feedTabActive: { color: '#111827' },
});