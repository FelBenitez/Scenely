// components/PostSheet.jsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, TextInput, Alert, Image } from 'react-native';
import { ActionSheetIOS, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export default function PostSheet({ post, onClose, userId }) {
  // Public
  const [pub, setPub] = useState([]);
  const [pagePub, setPagePub] = useState(0);
  const [hasMorePub, setHasMorePub] = useState(true);
  const [loadingPub, setLoadingPub] = useState(false);

  // Private (1:1 messages)
  const [priv, setPriv] = useState([]);
  const [pagePriv, setPagePriv] = useState(0);
  const [hasMorePriv, setHasMorePriv] = useState(true);
  const [loadingPriv, setLoadingPriv] = useState(false);

  // Single composer (contextual)
  const [draft, setDraft] = useState('');
  const [replyMode, setReplyMode] = useState('public'); // 'public' | 'private'
  const [recipientId, setRecipientId] = useState(null); // target for private

  // Profiles cache { [id]: { id, full_name, username, avatar_url } }
  const [profiles, setProfiles] = useState({});
  const [authorProfile, setAuthorProfile] = useState(null);

  const PAGE_SIZE = 20;
  const valid = !!post?.id && !!userId;
  const privateComposerDisabled =
    !!post?.author_only && userId !== post?.user_id && (recipientId == null || recipientId === post?.user_id);

  // ---------- helpers ----------
  const short = (id) => (id ? String(id).slice(0, 8) : '');
  const displayName = (profile, fallbackId) =>
    (profile?.full_name?.trim() || profile?.username?.trim() || `User ${short(fallbackId)}`);

  const avatarUri = (profile) => (profile?.avatar_url || null);

  const upsertSorted = (list, row) => {
    const idx = list.findIndex(c => c.id === row.id);
    const next = [...list];
    if (idx >= 0) next[idx] = { ...next[idx], ...row };
    else next.push(row);
    next.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return next;
  };

  // Bulk fetch and cache profiles for given userIds
  const ensureProfiles = useCallback(async (ids) => {
    const need = Array.from(new Set(ids.filter(Boolean))).filter(id => !profiles[id]);
    if (!need.length) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', need);
    if (error) {
      console.error('profiles fetch error:', error);
      return;
    }
    const merged = { ...profiles };
    (data || []).forEach(p => { merged[p.id] = p; });
    setProfiles(merged);
  }, [profiles]);

  // Reset when post changes 
  useEffect(() => {
    if (!post?.id) return;
    setPub([]); setPagePub(0); setHasMorePub(true);
    setPriv([]); setPagePriv(0); setHasMorePriv(true);
    setDraft('');
    setReplyMode('public');
    setRecipientId(null);

    // author profile for the header
    if (post.user_id) {
      (async () => {
        await ensureProfiles([post.user_id]);
        setAuthorProfile(prev => profiles[post.user_id] || prev || null);
      })();
    }

    loadPublic(true);
    loadPrivate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  // Keep authorProfile in sync when cache updates
  useEffect(() => {
    if (post?.user_id && profiles[post.user_id]) {
      setAuthorProfile(profiles[post.user_id]);
    }
  }, [post?.user_id, profiles]);

  // Realtime while open 
  useEffect(() => {
    if (!post?.id) return;

    const channel = supabase
      .channel(`post:${post.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${post.id}` },
        async (payload) => {
          const row = payload.new ?? payload.old;
          if (!row) return;

          // make sure we have the sender's profile cached
          await ensureProfiles([row.user_id]);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (row.is_private) {
              setPriv(prev => upsertSorted(prev, row));
            } else {
              setPub(prev => upsertSorted(prev, row));
            }
          } else if (payload.eventType === 'DELETE') {
            setPriv(prev => prev.filter(c => c.id !== row.id));
            setPub(prev => prev.filter(c => c.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [post?.id, ensureProfiles]);


  const handleDeletePost = useCallback(() => {
  if (!post?.id || !userId) return;
  if (userId !== post.user_id) return; // only author can delete

  Alert.alert('Delete this post?', 'This can’t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        try {
          const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', post.id);

          if (error) throw error;

          // Close the sheet; map.jsx will remove it via realtime listener
          onClose?.();
        } catch (e) {
          console.error(e);
          Alert.alert('Error', 'Failed to delete post.');
        }
      },
    },
  ]);
}, [post?.id, post?.user_id, userId, onClose]);



  // ---------- Loaders ----------
  const loadPublic = useCallback(async (reset=false) => {
    if (!post?.id || loadingPub) return;
    setLoadingPub(true);
    try {
      const next = reset ? 0 : pagePub;
      const start = next * PAGE_SIZE;

      const { data: rows, error } = await supabase
        .from('post_comments_visible')
        .select('id, post_id, user_id, text, created_at, is_private')
        .eq('post_id', post.id)
        .eq('is_private', false)
        .order('created_at', { ascending: true })
        .range(start, start + PAGE_SIZE - 1);

      if (error) throw error;

      // Preload sender profiles in one go
      await ensureProfiles((rows || []).map(r => r.user_id));

      // reaction counts (client aggregate)
      const ids = (rows ?? []).map(r => r.id);
      let byId = {};
      if (ids.length) {
        const { data: rx, error: rxErr } = await supabase
          .from('post_reactions')
          .select('comment_id, emoji')
          .in('comment_id', ids);
        if (rxErr) throw rxErr;
        byId = (rx || []).reduce((acc, r) => {
          acc[r.comment_id] = acc[r.comment_id] || {};
          acc[r.comment_id][r.emoji] = (acc[r.comment_id][r.emoji] || 0) + 1;
          return acc;
        }, {});
      }

      const withCounts = (rows || []).map(r => ({ ...r, reactions: byId[r.id] || {} }));
      setPub(prev => reset ? withCounts : [...prev, ...withCounts]);
      setHasMorePub((rows?.length ?? 0) === PAGE_SIZE);
      setPagePub(p => reset ? 1 : p + 1);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not load comments.');
    } finally {
      setLoadingPub(false);
    }
  }, [PAGE_SIZE, loadingPub, pagePub, post?.id, ensureProfiles]);

  const loadPrivate = useCallback(async (reset=false) => {
    if (!post?.id || loadingPriv) return;
    setLoadingPriv(true);
    try {
      const next = reset ? 0 : pagePriv;
      const start = next * PAGE_SIZE;

      const { data: rows, error } = await supabase
        .from('post_comments_visible')
        .select('id, post_id, user_id, text, created_at, is_private, recipient_id')
        .eq('post_id', post.id)
        .eq('is_private', true)
        .order('created_at', { ascending: true })
        .range(start, start + PAGE_SIZE - 1);

      if (error) throw error;

      // Preload sender profiles (and optional recipients if you want to show them)
      const idsToFetch = [
        ...(rows || []).map(r => r.user_id),
      ];
      await ensureProfiles(idsToFetch);

      setPriv(prev => reset ? (rows ?? []) : [...prev, ...(rows ?? [])]);
      setHasMorePriv((rows?.length ?? 0) === PAGE_SIZE);
      setPagePriv(p => reset ? 1 : p + 1);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not load private messages.');
    } finally {
      setLoadingPriv(false);
    }
  }, [PAGE_SIZE, loadingPriv, pagePriv, post?.id, ensureProfiles]);

  // Send (single) 
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
          is_private: false
        });
        if (error) throw error;
        setDraft('');
        loadPublic(true);
      } else {
        const targetId = recipientId || post.user_id;
        if (post.author_only && userId !== post.user_id && targetId === post.user_id) {
          Alert.alert('Private replies disabled', 'The author disabled private replies for this post.');
          return;
        }
        const { error } = await supabase.from('post_comments').insert({
          post_id: post.id,
          user_id: userId,
          text,
          is_private: true,
          recipient_id: targetId
        });
        if (error) throw error;
        setDraft('');
        loadPrivate(true);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to send.');
    }
  }, [valid, draft, replyMode, recipientId, post?.id, post?.user_id, post?.author_only, userId, loadPublic, loadPrivate]);

  //Overflow / block 
  const blockUser = useCallback(async (targetUserId) => {
    try {
      const { error } = await supabase
        .from('blocked_users')
        .upsert({ blocker_id: userId, blocked_id: targetUserId }, { onConflict: 'blocker_id,blocked_id' });
      if (error) throw error;
      Alert.alert('Blocked', 'You will no longer see this user.');
      setPriv(prev => prev.filter(c => c.user_id !== targetUserId && c.recipient_id !== targetUserId));
      setPub(prev => prev.filter(c => c.user_id !== targetUserId));
      setReplyMode('public');
      setRecipientId(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to block user.');
    }
  }, [userId]);

  const react = useCallback(async (commentId, emoji) => {
    try {
      const { error } = await supabase
        .from('post_reactions')
        .upsert({ comment_id: commentId, user_id: userId, emoji }, { onConflict: 'comment_id,user_id,emoji' });
      if (error) throw error;
      loadPublic(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to react.');
    }
  }, [loadPublic, userId]);

  const openMenu = useCallback((item) => {
    const isOwner = item.user_id === userId;

    const handleDelete = async () => {
      try {
        const { error } = await supabase.from('post_comments').delete().eq('id', item.id);
        if (error) throw error;
        setPriv(prev => prev.filter(c => c.id !== item.id));
        setPub(prev => prev.filter(c => c.id !== item.id));
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to delete comment.');
      }
    };

    const handleReport = async () => {
      try {
        const { error } = await supabase
          .from('reports')
          .insert({ reporter_id: userId, target_type: 'comment', target_id: item.id });
        if (error) throw error;
        Alert.alert('Reported', 'Thanks for the report.');
      } catch (e) { console.error(e); Alert.alert('Error', 'Failed to report.'); }
    };

    if (Platform.OS === 'ios') {
      const options = isOwner ? ['Delete', 'Cancel'] : ['Report', 'Block user', 'Cancel'];
      const cancelButtonIndex = options.length - 1;
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex }, async (i) => {
        const picked = options[i];
        if (picked === 'Delete') await handleDelete();
        if (picked === 'Report') await handleReport();
        if (picked === 'Block user') await blockUser(item.user_id);
      });
    } else {
      if (isOwner) {
        Alert.alert('Delete comment?', '', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: handleDelete },
        ]);
      } else {
        Alert.alert('Options', '', [
          { text: 'Report', onPress: handleReport },
          { text: 'Block user', onPress: () => blockUser(item.user_id) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    }
  }, [blockUser, userId]);

  // Combined list (private first, then public)
  const data = useMemo(() => {
    const privTagged = priv.map(r => ({ ...r, __kind: 'private' }));
    const pubTagged  = pub.map(r  => ({ ...r, __kind: 'public'  }));
    return [...privTagged, ...pubTagged];
  }, [priv, pub]);

  // Renderers
  const renderItem = ({ item }) => {
    const isPriv = item.__kind === 'private';
    const rx = item.reactions || {};
    const rxDisplay = ['👍', '🔥', '😂'].map(e => ({ e, n: rx[e] || 0 }));

    const senderProfile = profiles[item.user_id];
    const name = displayName(senderProfile, item.user_id);
    const avatar = avatarUri(senderProfile);

    // Determine the "other participant" for private replies
    const otherPartyId = isPriv
      ? (item.user_id === userId ? item.recipient_id : item.user_id)
      : null;

    const isTargeted =
      isPriv &&
      replyMode === 'private' &&
      otherPartyId &&
      recipientId &&
      otherPartyId === recipientId;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (!isPriv) return;
          setReplyMode('private');
          setRecipientId(otherPartyId || post.user_id);
        }}
        style={{ paddingVertical: 8, backgroundColor: isTargeted ? '#F1F5F9' : 'transparent', borderRadius: 8 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image
              source={avatar ? { uri: avatar } : null}
              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#eee', marginRight: 8 }}
            />
            <Text style={{ fontWeight: '600' }}>
              {isPriv ? '(private) ' : ''}
              {name}
            </Text>
          </View>
          <TouchableOpacity onPress={() => openMenu(item)}>
            <Text style={{ fontSize: 18 }}>⋯</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ marginTop: 4 }}>{item.text}</Text>

        {!isPriv && (
          <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
            {rxDisplay.map(({ e, n }) => (
              <TouchableOpacity
                key={e}
                onPress={() => react(item.id, e)}
                style={{ marginRight: 10, flexDirection: 'row', alignItems: 'center' }}
              >
                <Text>{e}</Text>
                {n > 0 && <Text style={{ marginLeft: 4, fontSize: 12, color: '#555' }}>{n}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isPriv && (
          <Text style={{ color:'#888', fontSize:12, marginTop:6 }}>
            Tap to reply privately to {otherPartyId === userId ? 'yourself' : displayName(profiles[otherPartyId], otherPartyId)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (!post) return <Modal visible={false} />;

  return (
    <Modal visible={!!post} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff', padding: 12 }}>
        {/* Header with author avatar/name and Close */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image
              source={avatarUri(authorProfile) ? { uri: avatarUri(authorProfile) } : null}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#eee', marginRight: 8 }}
            />
            <Text style={{ fontSize: 16, fontWeight: '700', flex: 1 }}>
              {displayName(authorProfile, post.user_id)}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: '#1976D2' }}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ marginTop: 6, fontSize: 16 }}>{post.text}</Text>
        </View>

        {/* Combined list */}
        <FlatList
          data={data}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 140 }}
          ListFooterComponent={
            (hasMorePriv || hasMorePub) ? (
              <View>
                {hasMorePriv && (
                  <TouchableOpacity disabled={loadingPriv} onPress={() => loadPrivate(false)}>
                    <Text style={{ color:'#1976D2', textAlign:'center', padding:10 }}>
                      {loadingPriv ? 'Loading private…' : 'Load more private'}
                    </Text>
                  </TouchableOpacity>
                )}
                {hasMorePub && (
                  <TouchableOpacity disabled={loadingPub} onPress={() => loadPublic(false)}>
                    <Text style={{ color:'#1976D2', textAlign:'center', padding:10 }}>
                      {loadingPub ? 'Loading public…' : 'Load more public'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null
          }
        />

        {/* Bottom actions: Delete (if author) + Close */}
<View style={{ alignItems: 'center', marginTop: 8 }}>
  <View style={{ flexDirection: 'row' }}>
    {userId === post.user_id && (
      <TouchableOpacity
        onPress={handleDeletePost}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#f3c4cd',
          backgroundColor: 'white',
          marginRight: 8, // spacing before Close
        }}
      >
        <Text style={{ color: '#E11D48', fontWeight: '600' }}>Delete</Text>
      </TouchableOpacity>
    )}

    <TouchableOpacity
      onPress={onClose}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        backgroundColor: 'white',
      }}
    >
      <Text style={{ color: '#1976D2', fontWeight: '600' }}>Close</Text>
    </TouchableOpacity>
  </View>
</View>

        {/* One composer that switches mode */}
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
            {replyMode === 'private' ? (
              <>
                <Text style={{ color:'#666', marginRight:8 }}>
                  Replying <Text style={{ fontWeight:'700' }}>(private)</Text>{' '}
                  {recipientId ? `to ${displayName(profiles[recipientId], recipientId)}` : 'to author'}
                </Text>
                <TouchableOpacity
                  onPress={() => { setReplyMode('public'); setRecipientId(null); }}
                  style={{ paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:'#ddd', borderRadius:8 }}
                >
                  <Text>Switch to Public</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ color:'#666', marginRight:8 }}>Public comment</Text>
                <TouchableOpacity
                  onPress={() => { setReplyMode('private'); setRecipientId(post.user_id); }}
                  style={{ paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:'#ddd', borderRadius:8 }}
                >
                  <Text>Private to {displayName(authorProfile, post.user_id)}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={{ flexDirection:'row' }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={replyMode === 'private' ? 'Private reply…' : 'Add public comment…'}
              style={{ flex:1, borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:8 }}
              editable={!(replyMode === 'private' && privateComposerDisabled)}
            />
            <TouchableOpacity
              onPress={send}
              style={{ marginLeft:10, backgroundColor:'#1976D2', padding:10, borderRadius:10 }}
            >
              <Text style={{ color:'white' }}>Send</Text>
            </TouchableOpacity>
          </View>

          {(replyMode === 'private' && privateComposerDisabled) && (
            <Text style={{ color:'#666', marginTop:6 }}>
              The author disabled private replies for this post.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}