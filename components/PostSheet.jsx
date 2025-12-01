// components/PostSheet.jsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList, TextInput, Alert, Image,
  StyleSheet, Platform, Pressable, Animated, Easing, KeyboardAvoidingView
} from 'react-native';
import { ActionSheetIOS } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Lock, Unlock, MapPin, Heart, MoreHorizontal, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { usePostHog } from 'posthog-react-native';

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);
const PAGE_SIZE = 20;

export default function PostSheet({ post, onClose, userId, onRecenterMap }) {
  // Lists (raw)
  const [pub, setPub] = useState([]);
  const [priv, setPriv] = useState([]);
  const [pagePub, setPagePub] = useState(0);
  const [pagePriv, setPagePriv] = useState(0);
  const [hasMorePub, setHasMorePub] = useState(true);
  const [hasMorePriv, setHasMorePriv] = useState(true);
  const [loadingPub, setLoadingPub] = useState(false);
  const [loadingPriv, setLoadingPriv] = useState(false);

  // Profiles cache
  const [profiles, setProfiles] = useState({});
  const [authorProfile, setAuthorProfile] = useState(null);

  // Compose
  const [draft, setDraft] = useState('');
  const [replyMode, setReplyMode] = useState('public');  // 'public' | 'private'
  const [recipientId, setRecipientId] = useState(null);  // private target (defaults to author)
  const [dmLocked, setDmLocked] = useState(false);       // can't send again until poster replies
  const [parentId, setParentId] = useState(null);        // replying to which root (or null)

  // Likes (post + comments)
  const [postLikeCount, setPostLikeCount] = useState(0);
  const [postLikedByMe, setPostLikedByMe] = useState(false);
  const [commentLikeCounts, setCommentLikeCounts] = useState({}); // { commentId: count }
  const [commentLikedByMe, setCommentLikedByMe] = useState({});   // { commentId: true }

  // UI
  const valid = !!post?.id && !!userId;
  const isAuthor = valid && userId === post?.user_id;

  // Animations (centered modal like ComposerSheet)
  const [mounted, setMounted] = useState(!!post);
  const backdrop = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  const posthog = usePostHog();

  useEffect(() => { if (post) setMounted(true); }, [post]);
  useEffect(() => {
    if (!mounted) return;
    if (post) {
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
  }, [post, mounted, backdrop, translateY]);

  // ---------- helpers ----------
  const short = (id) => (id ? String(id).slice(0, 8) : '');
  const displayName = (profile, fallbackId) =>
    (profile?.full_name?.trim() || profile?.username?.trim() || `User ${short(fallbackId)}`);
  const avatarUri = (profile) => (profile?.avatar_url || null);

  const ageLabel = (iso) => {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
};

  // Find the existing private root between two participants (earliest root)
  const privateRootFor = (allPriv, a, b) => {
    if (!a || !b) return null;
    const pair = new Set([a, b]);
    const roots = (allPriv || []).filter(r =>
      r.is_private &&
      !r.parent_id &&
      r.post_id === post?.id &&
      pair.has(r.user_id) &&
      pair.has(r.recipient_id)
    );
    if (!roots.length) return null;
    roots.sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
    return roots[0].id;
  };

  const ensureProfiles = useCallback(async (ids) => {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    const need = uniq.filter(id => !profiles[id]);
    if (!need.length) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', need);
    if (error) return;
    const merged = { ...profiles };
    (data || []).forEach(p => { merged[p.id] = p; });
    setProfiles(merged);
  }, [profiles]);

  // ---------- private DM “one at a time” lock ----------
  const computeDmLocked = useCallback(async () => {
    if (!post?.id || !userId || !post?.user_id) return setDmLocked(false);
    const viewer = userId;
    const poster = post.user_id;
    const { data, error } = await supabase
      .from('post_comments_visible')
      .select('id, user_id, recipient_id, created_at')
      .eq('post_id', post.id)
      .eq('is_private', true)
      .or(`user_id.eq.${viewer},user_id.eq.${poster}`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { setDmLocked(false); return; }
    const rows = (data || []).filter(r =>
      (r.user_id === viewer || r.user_id === poster) &&
      (r.recipient_id === viewer || r.recipient_id === poster)
    );
    const latest = rows[0];
    if (!latest) { setDmLocked(false); return; }
    setDmLocked(latest.user_id === viewer); // locked if you were last sender
  }, [post?.id, post?.user_id, userId]);

  // ---------- reset on post change ----------
  useEffect(() => {
    if (!post?.id) return;
    setPub([]); setPriv([]);
    setPagePub(0); setPagePriv(0);
    setHasMorePub(true); setHasMorePriv(true);
    setDraft('');
    setReplyMode('public');
    setRecipientId(null);
    setParentId(null);
    setCommentLikeCounts({});
    setCommentLikedByMe({});

    (async () => {
      if (post.user_id) {
        await ensureProfiles([post.user_id]);
        setAuthorProfile(prev => profiles[post.user_id] || prev || null);
      }
      await Promise.all([loadPublic(true), loadPrivate(true)]);
      await computeDmLocked();
      await initPostLikes();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  // keep author profile in sync
  useEffect(() => {
    if (post?.user_id && profiles[post.user_id]) setAuthorProfile(profiles[post.user_id]);
  }, [post?.user_id, profiles]);

  // ---------- realtime ----------
  useEffect(() => {
    if (!post?.id) return;

    const chan = supabase
      .channel(`post:${post.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${post.id}` },
        async (payload) => {
          const row = payload.new ?? payload.old;
          if (!row) return;
          await ensureProfiles([row.user_id, row.recipient_id].filter(Boolean));

         if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (row.is_private) {
            setPriv(prev => {
              const next = upsertSorted(prev, row);

              // If I'm a commenter (not the author) and I'm in Private mode with the author
              // but I don't have a parentId yet, auto-attach to the latest DM root between us.
              if (!isAuthor && replyMode === 'private' && recipientId === post.user_id && !parentId) {
                const latestRoot = [...next].reverse().find(r =>
                  r.is_private &&
                  !r.parent_id &&
                  (
                    (r.user_id === userId && r.recipient_id === post.user_id) ||
                    (r.user_id === post.user_id && r.recipient_id === userId)
                  )
                );
                if (latestRoot) setParentId(latestRoot.id);
              }
              return next;
            });
          } else {
            setPub(prev => upsertSorted(prev, row));
          }
          computeDmLocked();
        } else if (payload.eventType === 'DELETE') {
          setPriv(prev => prev.filter(c => c.id !== row.id));
          setPub(prev  => prev.filter(c => c.id !== row.id));
          if (parentId === row.id) setParentId(null); // if we were replying into a deleted thread, reset
          computeDmLocked();
        }
        }
      )
      // post likes
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'post_likes', filter: `post_id=eq.${post.id}` },
        (payload) => {
          setPostLikeCount(c => {
            if (payload.eventType === 'INSERT') return c + 1;
            if (payload.eventType === 'DELETE') return Math.max(0, c - 1);
            return c;
          });
          const uid = (payload.new?.user_id ?? payload.old?.user_id);
          if (uid === userId) setPostLikedByMe(payload.eventType === 'INSERT');
        }
      )
      // comment likes
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'post_comment_likes' },
        (payload) => {
          const cid = payload.new?.comment_id ?? payload.old?.comment_id;
          if (!cid) return;
          setCommentLikeCounts(prev => {
            const next = { ...prev };
            const cur = next[cid] || 0;
            if (payload.eventType === 'INSERT') next[cid] = cur + 1;
            else if (payload.eventType === 'DELETE') next[cid] = Math.max(0, cur - 1);
            return next;
          });
          const uid = payload.new?.user_id ?? payload.old?.user_id;
          if (uid === userId) {
            setCommentLikedByMe(prev => ({ ...prev, [cid]: payload.eventType === 'INSERT' }));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(chan).catch(()=>{}); };
  }, [post?.id, userId, ensureProfiles, computeDmLocked]);

  const upsertSorted = (list, row) => {
    const idx = list.findIndex(c => c.id === row.id);
    const next = [...list];
    if (idx >= 0) next[idx] = { ...next[idx], ...row };
    else next.push(row);
    next.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return next;
  };

  // ---------- loaders ----------
  const loadPublic = useCallback(async (reset=false) => {
    if (!post?.id || loadingPub) return;
    setLoadingPub(true);
    try {
      const page = reset ? 0 : pagePub;
      const start = page * PAGE_SIZE;
      const { data: rows, error } = await supabase
        .from('post_comments_visible')
        .select('id, post_id, user_id, text, created_at, is_private, parent_id, recipient_id')
        .eq('post_id', post.id)
        .eq('is_private', false)
        .order('created_at', { ascending: true })
        .range(start, start + PAGE_SIZE - 1);
      if (error) throw error;

      await ensureProfiles((rows || []).flatMap(r => [r.user_id, r.recipient_id]).filter(Boolean));
      await hydrateCommentLikes(rows || []);

      setPub(prev => reset ? (rows || []) : [...prev, ...(rows || [])]);
      setHasMorePub((rows?.length ?? 0) === PAGE_SIZE);
      setPagePub(p => reset ? 1 : p + 1);
    } catch (e) {
      Alert.alert('Error', 'Could not load comments.');
    } finally {
      setLoadingPub(false);
    }
  }, [post?.id, loadingPub, pagePub, ensureProfiles]);

  const loadPrivate = useCallback(async (reset=false) => {
    if (!post?.id || loadingPriv) return;
    setLoadingPriv(true);
    try {
      const page = reset ? 0 : pagePriv;
      const start = page * PAGE_SIZE;

      const { data: rows, error } = await supabase
        .from('post_comments_visible')
        .select('id, post_id, user_id, text, created_at, is_private, parent_id, recipient_id')
        .eq('post_id', post.id)
        .eq('is_private', true)
        .order('created_at', { ascending: true })
        .range(start, start + PAGE_SIZE - 1);
      if (error) throw error;

      await ensureProfiles((rows || []).flatMap(r => [r.user_id, r.recipient_id]).filter(Boolean));
      await hydrateCommentLikes(rows || []);

      setPriv(prev => reset ? (rows || []) : [...prev, ...(rows || [])]);
      // If we're currently in private mode with a selected recipient but no parent, attach to existing root
      const combinedPriv = reset ? (rows || []) : [...(priv || []), ...(rows || [])];
      if (replyMode === 'private' && recipientId && !parentId) {
        const root = privateRootFor(combinedPriv, userId, recipientId);
        if (root) setParentId(root);
      }
      setHasMorePriv((rows?.length ?? 0) === PAGE_SIZE);
      setPagePriv(p => reset ? 1 : p + 1);
    } catch (e) {
      Alert.alert('Error', 'Could not load private messages.');
    } finally {
      setLoadingPriv(false);
    }
  }, [post?.id, loadingPriv, pagePriv, ensureProfiles]);

  // ---------- likes init ----------
  async function initPostLikes() {
    try {
      // Count likes
      const { count: cnt } = await supabase
        .from('post_likes')
        .select('user_id', { count: 'exact', head: true })
        .eq('post_id', post.id);
      setPostLikeCount(cnt || 0);

      // Did I like?
      const { count: mineCnt } = await supabase
      .from('post_likes')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .eq('user_id', userId);
      setPostLikedByMe((mineCnt || 0) > 0);
    } catch {
      setPostLikeCount(0);
      setPostLikedByMe(false);
    }
  }

  async function hydrateCommentLikes(rows) {
    const ids = rows.map(r => r.id);
    if (!ids.length) return;
    // counts
    const { data: all } = await supabase
      .from('post_comment_likes')
      .select('comment_id')
      .in('comment_id', ids);
    const counts = {};
    (all || []).forEach(r => { counts[r.comment_id] = (counts[r.comment_id] || 0) + 1; });
    setCommentLikeCounts(prev => ({ ...prev, ...counts }));
    // mine
    const { data: mine } = await supabase
      .from('post_comment_likes')
      .select('comment_id')
      .eq('user_id', userId)
      .in('comment_id', ids);
    const mineSet = {};
    (mine || []).forEach(r => { mineSet[r.comment_id] = true; });
    setCommentLikedByMe(prev => ({ ...prev, ...mineSet }));
  }

  // ---------- likes actions ----------
  const togglePostLike = useCallback(async () => {
    if (!valid) return;
    try {
      if (postLikedByMe) {
        await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', userId);
      } else {
        await supabase.from('post_likes').insert({ post_id: post.id, user_id: userId });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert('Error', 'Failed to update like.');
    }
  }, [valid, postLikedByMe, post?.id, userId]);

  const likeComment = useCallback(async (commentId) => {
    try {
      await supabase.from('post_comment_likes').insert({ comment_id: commentId, user_id: userId });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, [userId]);

  const unlikeComment = useCallback(async (commentId) => {
    try {
      await supabase.from('post_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
      Haptics.selectionAsync();
    } catch {}
  }, [userId]);

  // ---------- send ----------
  const send = useCallback(async () => {
    if (!valid) return;
    const text = draft.trim();
    if (!text) return;

    try {
      if (replyMode === 'public') {
        const { error } = await supabase.from('post_comments').insert({
          post_id: post.id,
          user_id: userId,
          text,
          is_private: false,
          parent_id: parentId || null,
        });
        if (error) throw error;
      } else {
        if (dmLocked) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return;
        }
        if (isAuthor && (!recipientId || recipientId === userId)) {
          Alert.alert('Private DMs', 'You can only private reply to users who messaged you first.');
          return;
        }
        const targetId = recipientId || post.user_id;
        const { error } = await supabase.from('post_comments').insert({
          post_id: post.id,
          user_id: userId,
          text,
          is_private: true,
          recipient_id: targetId,
          parent_id: parentId || null,
        });
        if (error) throw error;
      }
      posthog?.capture('Comment Sent', { isPrivate: replyMode === 'private' });
      setDraft('');
      setParentId(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert('Error', 'Failed to send.');
    }
  }, [valid, draft, replyMode, recipientId, post?.id, userId, dmLocked, parentId]);

  // ---------- overflow (post-level ⋯) ----------
  const openPostMenu = useCallback(() => {
    const doDelete = async () => {
      try {
        const { error } = await supabase.from('posts').delete().eq('id', post.id);
        if (error) throw error;
        onClose?.();
      } catch { Alert.alert('Error', 'Failed to delete post.'); }
    };
    const doReport = async () => {
      try {
        // target_id is bigint in your schema; posts.id is uuid.
        // Store null and let middleware/ops triage.
        const { error } = await supabase
          .from('reports')
          .insert({ reporter_id: userId, target_type: 'post', target_id: null, reason: 'post' });
        if (error) throw error;
        Alert.alert('Reported', 'Thanks for the report.');
      } catch { Alert.alert('Error', 'Failed to report.'); }
    };
    const doBlock = async () => {
      try {
        const { error } = await supabase
          .from('blocked_users')
          .upsert({ blocker_id: userId, blocked_id: post.user_id }, { onConflict: 'blocker_id,blocked_id' });
        if (error) throw error;
        Alert.alert('Blocked', 'You will no longer see this user.');
        onClose?.();
      } catch { Alert.alert('Error', 'Failed to block user.'); }
    };

    if (Platform.OS === 'ios') {
      const options = isAuthor ? ['Delete Post', 'Cancel'] : ['Report Post', 'Block User', 'Cancel'];
      const cancelButtonIndex = options.length - 1;
      const destructiveButtonIndex = isAuthor ? 0 : undefined;
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex, destructiveButtonIndex },
        (i) => {
          const picked = options[i];
          if (picked === 'Delete Post') doDelete();
          if (picked === 'Report Post') doReport();
          if (picked === 'Block User') doBlock();
        }
      );
    } else {
      if (isAuthor) {
        Alert.alert('Delete this post?', 'This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]);
      } else {
        Alert.alert('Post options', '', [
          { text: 'Report', onPress: doReport },
          { text: 'Block user', onPress: doBlock },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    }
  }, [isAuthor, post?.id, post?.user_id, userId, onClose]);

  // ---------- per-comment quick menu (⋯ on each row) ----------
  const openCommentMenu = useCallback((item) => {
    const isOwner = item.user_id === userId;
    const handleDelete = async () => {
      try {
        const { error } = await supabase.from('post_comments').delete().eq('id', item.id);
        if (error) throw error;
        setPriv(prev => prev.filter(c => c.id !== item.id));
        setPub(prev  => prev.filter(c => c.id !== item.id));
      } catch { Alert.alert('Error', 'Failed to delete comment.'); }
    };
    const handleReport = async () => {
      try {
        const { error } = await supabase
          .from('reports')
          .insert({ reporter_id: userId, target_type: 'comment', target_id: item.id });
        if (error) throw error;
        Alert.alert('Reported', 'Thanks for the report.');
      } catch { Alert.alert('Error', 'Failed to report.'); }
    };
    const handleBlock = async () => {
      try {
        const { error } = await supabase
          .from('blocked_users')
          .upsert({ blocker_id: userId, blocked_id: item.user_id }, { onConflict: 'blocker_id,blocked_id' });
        if (error) throw error;
        Alert.alert('Blocked', 'You will no longer see this user.');
        setPriv(prev => prev.filter(c => c.user_id !== item.user_id && c.recipient_id !== item.user_id));
        setPub(prev  => prev.filter(c => c.user_id !== item.user_id));
      } catch { Alert.alert('Error', 'Failed to block user.'); }
    };

    if (Platform.OS === 'ios') {
      const options = isOwner ? ['Delete', 'Cancel'] : ['Report', 'Block user', 'Cancel'];
      const cancelButtonIndex = options.length - 1;
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex }, (i) => {
        const picked = options[i];
        if (picked === 'Delete') handleDelete();
        if (picked === 'Report') handleReport();
        if (picked === 'Block user') handleBlock();
      });
    } else {
      if (isOwner) {
        Alert.alert('Delete comment?', '', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: handleDelete },
        ]);
      } else {
        Alert.alert('Comment options', '', [
          { text: 'Report', onPress: handleReport },
          { text: 'Block user', onPress: handleBlock },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    }
  }, [userId]);

  // ---------- build one-level threads ----------
  const threaded = useMemo(() => {
    const make = (rows) => {
      const roots = rows
     .filter(r => !r.parent_id)
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); // newest roots first
      const childrenByParent = rows.reduce((acc, r) => {
        if (r.parent_id) (acc[r.parent_id] = acc[r.parent_id] || []).push(r);
        return acc;
      }, {});
      Object.values(childrenByParent).forEach(list =>
        list.sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
      );
      const out = [];
      roots.forEach(root => {
        out.push({ ...root, __depth: 0 });
        (childrenByParent[root.id] || []).forEach(ch => out.push({ ...ch, __depth: 1 }));
      });
      return out;
    };
    return { priv: make(priv), pub: make(pub) };
  }, [priv, pub]);

  const data = useMemo(() => {
    const tag = (arr, kind) => arr.map(r => ({ ...r, __kind: kind }));
    return [...tag(threaded.priv, 'private'), ...tag(threaded.pub, 'public')];
  }, [threaded]);

  // ---------- renderers ----------
  const renderItem = ({ item }) => {
    const isPriv = item.__kind === 'private';
    const sender = profiles[item.user_id];
    const name = displayName(sender, item.user_id);
    const otherId = isPriv ? (item.user_id === userId ? item.recipient_id : item.user_id) : null;

    const liked = !!commentLikedByMe[item.id];
    const likeCount = commentLikeCounts[item.id] || 0;
    const indent = item.__depth === 1;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { if (liked) unlikeComment(item.id); }}
        style={[styles.msgWrap, isPriv && styles.msgPriv, indent && styles.msgIndent]}
      >
        <View style={styles.msgHeader}>
          <View style={styles.msgHeaderLeft}>
            <Image
              source={avatarUri(sender) ? { uri: avatarUri(sender) } : null}
              style={styles.avatar}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {isPriv ? <Lock size={14} color="#6B7280" style={{ marginRight: 4 }} /> : null}
              <Text style={styles.msgAuthor}>{name}</Text>
              <Text style={styles.msgTime}>  •  {ageLabel(item.created_at)} ago</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => liked ? unlikeComment(item.id) : likeComment(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.likeBtn}
            >
              <Heart size={16} color={liked ? '#DC2626' : '#111'} fill={liked ? '#DC2626' : 'transparent'} />
              {likeCount > 0 && <Text style={styles.likeCount}>{likeCount}</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => openCommentMenu(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MoreHorizontal size={18} color="#111" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.msgText}>{item.text}</Text>

        {!indent && (
          <View style={styles.replyRow}>
            <TouchableOpacity
              onPress={() => {
                setParentId(item.id);
                if (isPriv) {
                  setReplyMode('private');
                  setRecipientId(otherId || post.user_id);
                }
              }}
            >
              <Text style={styles.replyText}>Reply</Text>
            </TouchableOpacity>
          </View>
        )}

        {isPriv && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              setReplyMode('private');
              setRecipientId(otherId || post.user_id);
              setParentId(item.parent_id || item.id);
            }}
          >
            <Text style={styles.msgHint}>
              Reply privately to {otherId === userId ? 'yourself' : displayName(profiles[otherId], otherId)}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (!mounted) return null;

  const minutesLeft = (() => {
    if (!post?.created_at) return null;
    const now = Date.now();
    const start = new Date(post.created_at).getTime();
    const end = post.expires_at ? new Date(post.expires_at).getTime() : start + 4 * 60 * 60 * 1000;
    return Math.max(0, Math.round((end - now) / 60000));
  })();

  const recipientName = recipientId ? displayName(profiles[recipientId], recipientId) : displayName(authorProfile, post?.user_id);
  const placeholder = replyMode === 'private'
    ? `Private message to ${recipientName}…`
    : (parentId ? 'Reply…' : 'Add public comment…');

  return (
    <Modal transparent visible={!!post} animationType="none" onRequestClose={onClose}>
      <AnimatedBlur intensity={20} tint="light" style={[StyleSheet.absoluteFill, styles.blurBG, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* --- ADDED KEYBOARD AVOIDING VIEW --- */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kbContent}
          pointerEvents="box-none"
        >

        <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image
                source={avatarUri(authorProfile) ? { uri: avatarUri(authorProfile) } : null}
                style={styles.headerAvatar}
              />
              <View>
                <Text style={styles.headerName}>{displayName(authorProfile, post?.user_id)}</Text>
                <Text style={styles.headerMeta}>
                  {minutesLeft != null ? `Expires in ${minutesLeft}m` : ''}  •  {post?.category ?? 'event'}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={openPostMenu} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MoreHorizontal size={20} color="#111" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={[styles.iconBtn, { marginLeft: 6 }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#111" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Body */}
          {!!post?.text && <Text style={styles.postText}>{post.text}</Text>}

          {!!post?.photo_url && (
            <View style={styles.photoWrap}>
              <Image source={{ uri: post.photo_url }} style={styles.photo} />
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity activeOpacity={0.8} style={styles.actBtn} onPress={togglePostLike}>
              <Heart size={18} color={postLikedByMe ? '#DC2626' : '#111'} fill={postLikedByMe ? '#DC2626' : 'transparent'} />
              <Text style={styles.actLabel}>{postLikeCount}</Text>
            </TouchableOpacity>

            <View style={styles.dotSep} />

            <View style={styles.actBtn}>
              <Text style={styles.actLabel}>{pub.length + priv.length} comments</Text>
            </View>

            <View style={styles.dotSep} />

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.actBtn}
              onPress={() => {
                if (onRecenterMap && Number.isFinite(post?.lng) && Number.isFinite(post?.lat)) {
                  onRecenterMap({ lng: post.lng, lat: post.lat, zoom: 17 });
                  onClose?.();
                }
              }}
            >
              <MapPin size={18} color="#111" />
              <Text style={styles.actLabel}>Map</Text>
            </TouchableOpacity>
          </View>

          {/* Thread */}
          <FlatList
            data={data}
            keyExtractor={(i) => String(i.id)}
            renderItem={renderItem}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            ListEmptyComponent={<Text style={styles.empty}>Be the first to comment 🍕</Text>}
            ListFooterComponent={
              (hasMorePriv || hasMorePub) ? (
                <View style={{ marginTop: 6 }}>
                  {hasMorePriv && (
                    <TouchableOpacity disabled={loadingPriv} onPress={() => loadPrivate(false)}>
                      <Text style={styles.loadMore}>{loadingPriv ? 'Loading private…' : 'Load more private'}</Text>
                    </TouchableOpacity>
                  )}
                  {hasMorePub && (
                    <TouchableOpacity disabled={loadingPub} onPress={() => loadPublic(false)}>
                      <Text style={styles.loadMore}>{loadingPub ? 'Loading public…' : 'Load more public'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null
            }
          />

          {/* Composer */}
          <View style={styles.composer}>
            <View style={styles.modeRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                const next = replyMode === 'public' ? 'private' : 'public';
                // Prevent poster from starting a DM with themselves
                if (next === 'private' && isAuthor && (!recipientId || recipientId === userId)) {
                  Alert.alert('Private DMs', 'As the poster, start a private reply from a user’s private message.');
                  return;
                }
                setReplyMode(next);
                if (next === 'private') {
                  // Determine who you’re DMing:
                  // - If you’re not the author, DM the author by default
                  // - If you are the author, we only allow DMing someone who messaged you first (recipientId must be set elsewhere)
                  const target = !isAuthor ? (recipientId || post.user_id) : recipientId;
                  const finalTarget = target || post.user_id;
                  setRecipientId(finalTarget);
                  // If there’s already a private thread with this person, attach to its root
                  const root = privateRootFor(priv, userId, finalTarget);
                  setParentId(root || null);
                } else {
                  // Back to public: clear any private parent
                  setParentId(null);
                }

                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
                style={[styles.modeToggle, replyMode === 'private' ? styles.modeOn : styles.modeOff]}
              >
                {replyMode === 'private' ? <Lock size={16} color="#111" /> : <Unlock size={16} color="#111" />}
                <Text style={styles.modeText}>{replyMode === 'private' ? 'Private' : 'Public'}</Text>
              </TouchableOpacity>

              {replyMode === 'private' && dmLocked && (
                <View style={styles.lockPill}>
                  <Lock size={14} color="#B45309" />
                  <Text style={styles.lockPillText}>Wait for the poster to reply</Text>
                </View>
              )}
            </View>

            {parentId && (
              <View style={styles.replyingTo}>
                <Text style={styles.replyingToText}>Replying in thread</Text>
                <TouchableOpacity onPress={() => setParentId(null)} style={styles.replyingToX}>
                  <X size={14} color="#111" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                style={styles.input}
                editable={!(replyMode === 'private' && dmLocked)}
                maxLength={300}
                multiline
              />
              <TouchableOpacity
                onPress={send}
                disabled={(replyMode === 'private' && dmLocked) || !draft.trim()}
                style={[styles.sendBtn, ((replyMode === 'private' && dmLocked) || !draft.trim()) && styles.sendDisabled]}
              >
                <Text style={styles.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
        </KeyboardAvoidingView>
      </AnimatedBlur>
    </Modal>
  );
}

const styles = StyleSheet.create({
  blurBG: { justifyContent: 'center'},

  kbContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    width: '92%',
    maxWidth: 560,
    maxHeight: '86%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' },
  headerName: { fontSize: 16, fontWeight: '800', color: '#111' },
  headerMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  iconBtn: { padding: 6, borderRadius: 10, backgroundColor: '#F3F4F6' },

  postText: { fontSize: 16, color: '#111', marginTop: 4, marginBottom: 10 },
  photoWrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#F3F4F6', marginBottom: 10 },
  photo: { width: '100%', aspectRatio: 16 / 9 },

  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, marginBottom: 6 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actLabel: { fontWeight: '700', color: '#111' },
  dotSep: { width: 1, height: 16, backgroundColor: '#E5E7EB' },

  empty: { textAlign: 'center', color: '#6B7280', marginTop: 10 },

  msgWrap: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, backgroundColor: 'transparent' },
  msgPriv: { backgroundColor: '#FFF7ED' },
  msgIndent: { marginLeft: 22, borderLeftWidth: 2, borderLeftColor: '#FDE68A', paddingLeft: 8 },

  msgHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  msgHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#eee' },
  msgAuthor: { fontWeight: '700', color: '#111' },
  msgTime: { marginLeft: 2, color: '#6B7280', fontSize: 12, fontWeight: '600' },
  msgText: { marginTop: 4, color: '#111' },

  replyRow: { marginTop: 6 },
  replyText: { color: '#1976D2', fontWeight: '700', fontSize: 12 },

  msgHint: { color: '#6B7280', fontSize: 12, marginTop: 6 },

  composer: { marginTop: 8 },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modeToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  modeOn: { backgroundColor: '#FDE68A', borderWidth: 1, borderColor: '#F59E0B' },
  modeOff: { backgroundColor: '#F3F4F6' },
  modeText: { fontWeight: '700', color: '#111' },

  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF7ED', borderColor: '#F59E0B', borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  lockPillText: { color: '#B45309', fontWeight: '700', fontSize: 12 },

  replyingTo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6
  },
  replyingToText: { fontSize: 12, color: '#374151', fontWeight: '700' },
  replyingToX: { padding: 6, borderRadius: 8, backgroundColor: '#E5E7EB' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, minHeight: 40, color: '#111' },
  sendBtn: { backgroundColor: '#111827', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  sendDisabled: { backgroundColor: '#9CA3AF' },
  sendText: { color: 'white', fontWeight: '800' },

  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCount: { fontSize: 12, fontWeight: '700', color: '#111' },
});