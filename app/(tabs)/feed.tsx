// app/(tabs)/feed.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import PostCard from '../../components/PostCard';
import FeedTopBar from '../../components/FeedTopBar';
import PostSheet from '../../components/PostSheet';
import { rankTop, rankNew, deDupeSimilar } from '../../utils/ranking';

type Profile = { avatar_url?: string | null; username?: string | null };
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
  likedByMe?: boolean;
  profiles?: Profile;
  category?: 'event' | 'freebies' | 'here' | 'talk' | string | null;
  avatar_url?: string | null;   // convenience
  distanceLabel?: string;
  _dupeCount?: number;
};

const ONLINE_WINDOW_MIN = 10;

const FeedTab: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<'Top' | 'New'>('Top');
  const [refreshing, setRefreshing] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Post | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // ---- POSTS ----
  const fetchPosts = useCallback(async () => {
    // wider window so the feed isn't empty early on
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('posts')
      .select(
        // IMPORTANT: no "reactions" or "comments" here — those columns do not exist
        'id, text, lat, lng, created_at, expires_at, user_id, photo_url, category, profiles:user_id(avatar_url, username)'
      )
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('feed fetch error:', error.message);
      setPosts([]);
      return;
    }

    const normalized: Post[] = (data as Post[] | null)?.map((p) => ({
      ...p,
      avatar_url: p?.profiles?.avatar_url ?? null,
      reactions: 0, // fallback for ranking/UI
      comments: 0,  // fallback for ranking/UI
    })) ?? [];

    // Hydrate counts and "liked by me" for the initial load
    try {
      const ids = normalized.map(p => p.id).filter(Boolean);
      if (ids.length) {
        const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
          supabase.from('post_likes').select('post_id').in('post_id', ids as any),
          supabase.from('post_comments_visible').select('post_id').in('post_id', ids as any),
        ]);

        const likeMap: Record<string, number> = {};
        (likeRows || []).forEach((r: any) => {
          const k = String(r.post_id);
          likeMap[k] = (likeMap[k] || 0) + 1;
        });
        const commentMap: Record<string, number> = {};
        (commentRows || []).forEach((r: any) => {
          const k = String(r.post_id);
          commentMap[k] = (commentMap[k] || 0) + 1;
        });

        let meId: string | null = null;
        try { const { data: { user } } = await supabase.auth.getUser(); meId = user?.id ?? null; } catch {}
        let mineSet = new Set<string>();
        if (meId) {
          const { data: mineRows } = await supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', meId)
            .in('post_id', ids as any);
          mineSet = new Set((mineRows || []).map((r: any) => String(r.post_id)));
        }

        normalized.forEach((p: any) => {
          const k = String(p.id);
          p.reactions = likeMap[k] || 0;
          p.comments = commentMap[k] || 0;
          p.likedByMe = mineSet.has(k);
        });
      }
    } catch {}

    setPosts(normalized);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Get current user id (needed for PostSheet interactions & likedByMe updates)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id ?? null);
      } catch {}
    })();
  }, []);

  // Realtime: keep feed fresh for inserts/deletes
  useEffect(() => {
    const ch = supabase
      .channel('realtime:feed-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const p = payload.new as Post;
        // look up avatar once for the inserted row
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('avatar_url, username')
            .eq('id', p.user_id as string)
            .single();
          setPosts(prev => [
            { ...p, avatar_url: prof?.avatar_url ?? null, profiles: { avatar_url: prof?.avatar_url ?? null, username: prof?.username ?? null }, reactions: 0, comments: 0 },
            ...prev,
          ].slice(0, 200));
        } catch {
          setPosts(prev => [{ ...p, reactions: 0, comments: 0 }, ...prev].slice(0, 200));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (payload) => {
        const oldId = payload?.old?.id;
        if (!oldId) return;
        setPosts(prev => prev.filter(p => String(p.id) !== String(oldId)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch).catch(()=>{}); };
  }, []);

  // Realtime: likes + comments to keep counts in sync on the feed
  useEffect(() => {
    const likeChan = supabase
      .channel('realtime:feed-likes-comments')
      // Listen for post likes (both inserts and deletes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, (payload) => {
        const postId = (payload as any).new?.post_id ?? (payload as any).old?.post_id;
        if (!postId) return;
        const isMine = !!userId && ((payload as any).new?.user_id === userId || (payload as any).old?.user_id === userId);
        setPosts(prev => prev.map(p =>
          String(p.id) === String(postId)
            ? {
                ...p,
                reactions: Math.max(0, (p.reactions ?? 0) + ((payload as any).eventType === 'INSERT' ? 1 : -1)),
                likedByMe: isMine ? ((payload as any).eventType === 'INSERT') : p.likedByMe,
              }
            : p
        ));
      })
      // Listen for post comments (insert & delete to keep count accurate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, (payload) => {
        const postId = (payload as any).new?.post_id;
        if (!postId) return;
        setPosts(prev => prev.map(p =>
          String(p.id) === String(postId)
            ? { ...p, comments: (p.comments ?? 0) + 1 }
            : p
        ));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_comments' }, (payload) => {
        const postId = (payload as any).old?.post_id;
        if (!postId) return;
        setPosts(prev => prev.map(p =>
          String(p.id) === String(postId)
            ? { ...p, comments: Math.max(0, (p.comments ?? 0) - 1) }
            : p
        ));
      })
      .subscribe();

    return () => { supabase.removeChannel(likeChan).catch(() => {}); };
  }, [userId]);

  // ---- ONLINE COUNT.. matches Map logic: last 10 minutes) ----
  const pollOnline = useCallback(async () => {
    const sinceIso = new Date(Date.now() - ONLINE_WINDOW_MIN * 60_000).toISOString();
    // Use a HEAD count for efficiency
    const { count, error } = await supabase
      .from('live_locations')
      .select('user_id', { count: 'exact', head: true })
      .gt('last_seen', sinceIso);

    if (!error) setOnlineCount(count ?? 0);
  }, []);

  useEffect(() => {
    pollOnline();
    const id = setInterval(pollOnline, 20_000);
    return () => clearInterval(id);
  }, [pollOnline]);

  // ---- DATASET / REFRESH ----
  const dataset = useMemo(() => {
    const base = tab === 'New' ? rankNew(posts) : rankTop(posts);
    return deDupeSimilar(base) as Post[];
  }, [posts, tab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchPosts(); await pollOnline(); } finally { setRefreshing(false); }
  }, [fetchPosts, pollOnline]);

  // ---- RENDER ----
  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.headerArea}>
        <FeedTopBar onlineCount={onlineCount} tab={tab} onChangeTab={setTab} />
      </View>

      {/* Posts area (soft background) */}
      <View style={styles.listArea}>
        <FlatList
          data={dataset}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              variant="list"
              onPress={() => setSelected(item)}
              onViewMap={() => {
                if (Number.isFinite(item?.lat) && Number.isFinite(item?.lng)) {
                  router.push({ pathname: '/(tabs)/map', params: { lat: String(item.lat), lng: String(item.lng), zoom: '17', focusId: String(item.id) } });
                } else {
                  router.push('/(tabs)/map');
                }
              }}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>It’s quiet right now</Text>
              <Text style={styles.emptySub}>Pull to refresh or be the first to post.</Text>
            </View>
          }
          contentInsetAdjustmentBehavior="automatic"
        />
      </View>

      {selected && (
        <PostSheet
          post={selected}
          onClose={() => setSelected(null)}
          userId={userId ?? undefined}
          onRecenterMap={() => { /* no-op on feed; map recenter not applicable */ }}
        />
      )}
    </SafeAreaView>
  );
};

export default FeedTab;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  headerArea: { backgroundColor: '#FFFFFF' },
  listArea: { flex: 1, backgroundColor: '#F7F7F8' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  emptySub: { marginTop: 6, color: '#6B7280' },
});