// app/(tabs)/map.jsx
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

const token =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_TOKEN;

console.log('Mapbox token prefix:', token?.slice(0, 3));
MapboxGL.setAccessToken(token || '');

// O(n) grid-hash clustering with latitude correction (~10m buckets)
  const clusterPosts = (posts, refLat = 30.28) => {
  const METERS_TO_LAT = 10 / 111000;
  const METERS_TO_LNG = 10 / (111000 * Math.cos((refLat * Math.PI) / 180));
  const GRID_SIZE_LAT = METERS_TO_LAT;
  const GRID_SIZE_LNG = METERS_TO_LNG;

  const grid = new Map();

  posts.forEach(post => {
    if (!Number.isFinite(post?.lat) || !Number.isFinite(post?.lng)) return;

    const cellX = Math.floor(post.lng / GRID_SIZE_LNG);
    const cellY = Math.floor(post.lat / GRID_SIZE_LAT);
    const key = `${cellX},${cellY}`;

    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(post);
  });

  return Array.from(grid.values()).filter(cluster => cluster.length > 0);
};

  export default function MapTab() {
  const cameraRef = useRef(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [userLoc, setUserLoc] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const lastPostTime = useRef(0);

  // Memoize clusters (use current latitude for accurate lng meters)
  const clusters = useMemo(
    () => clusterPosts(posts, userLoc?.latitude ?? 30.28),
    [posts, userLoc?.latitude]
  );

  // Get user location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const { coords } = await Location.getCurrentPositionAsync({});
          setUserLoc({ latitude: coords.latitude, longitude: coords.longitude });
        }
      } catch (error) {
        console.error('Error getting location:', error);
      }
    })();
  }, []);

  // Fetch existing posts on load (last 4 hours, limit 400)
  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .gt('created_at', fourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(400);

        if (error) {
          console.error('Error fetching posts:', error);
        } else {
          setPosts(data || []);
        }
      } catch (error) {
        console.error('Unexpected error fetching posts:', error);
      }
    };

    fetchPosts();
  }, []);

  // Realtime inserts with cleanup + 4h window + 400 cap
  useEffect(() => {
    let channel = null;

    const setupRealtime = async () => {
      try {
        channel = supabase
          .channel('public:posts')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'posts' },
            payload => {
              try {
                const post = payload.new;
                if (!post?.id || !Number.isFinite(post?.lat) || !Number.isFinite(post?.lng)) return;

                setPosts(prev => {
                  if (prev.some(p => p.id === post.id)) return prev;
                  const updated = [post, ...prev];

                  const fourHoursAgoMs = Date.now() - 4 * 60 * 60 * 1000;
                  return updated
                    .filter(p => p?.created_at && new Date(p.created_at).getTime() > fourHoursAgoMs)
                    .slice(0, 400);
                });
              } catch (err) {
                console.error('Error handling realtime insert:', err);
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Error setting up realtime:', err);
      }
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel).catch(err => {
          console.error('Error removing channel:', err);
        });
      }
    };
  }, []);

  const submitPost = async () => {
    try {
      // Rate limiting: 10 seconds between posts
      const now = Date.now();
      if (now - lastPostTime.current < 10000) {
        const secondsLeft = Math.ceil((10000 - (now - lastPostTime.current)) / 1000);
        alert(`Please wait ${secondsLeft} more seconds before posting again`);
        return;
      }

      let lat = userLoc?.latitude;
      let lng = userLoc?.longitude;

      if (lat == null || lng == null) {
        try {
          const { coords } = await Location.getCurrentPositionAsync({});
          lat = coords.latitude;
          lng = coords.longitude;
        } catch {
          lat = 30.2849;
          lng = -97.7341;
        }
      }

      const text = draftText.trim();
      if (!text) return;

      const { data, error } = await supabase
        .from('posts')
        .insert([{ text, lat, lng }])
        .select();

      if (error) {
        console.error('Error posting:', error);
        alert('Failed to post. Please try again.');
        return;
      }

      if (data && data[0]) {
        lastPostTime.current = now;
        setPosts(prev => [data[0], ...prev]);
        setDraftText('');
        setComposerOpen(false);

        cameraRef.current?.setCamera({
          centerCoordinate: [lng, lat],
          zoomLevel: 16,
          animationDuration: 500,
        });

        console.log('Posted to Supabase:', data[0]);
      }
    } catch (error) {
      console.error('Unexpected error submitting post:', error);
      alert('Something went wrong. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={MapboxGL.StyleURL.Street}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={[-97.7341, 30.2849]}
          zoomLevel={14}
          animationMode="none"
          animationDuration={0}
        />

        <MapboxGL.UserLocation
          visible={true}
          onUpdate={(e) => {
            if (e?.coords) {
              setUserLoc({
                latitude: e.coords.latitude,
                longitude: e.coords.longitude,
              });
            }
          }}
        />

        {clusters.map((cluster, idx) => {
          if (!cluster || cluster.length === 0) return null;

          const post = cluster[0];
          if (!post?.lng || !post?.lat || !post?.text) return null;

          const isMultiple = cluster.length > 1;

          return (
            <MapboxGL.MarkerView
              key={`cluster-${idx}-${post.id}`}
              id={`cluster-${idx}-${post.id}`}
              coordinate={[post.lng, post.lat]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (isMultiple) setSelectedCluster(cluster);
                }}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.bubble}>
                    {isMultiple ? (
                      <Text style={styles.bubbleText}>
                        {cluster.length} posts • tap to view
                      </Text>
                    ) : (
                      <Text style={styles.bubbleText}>{post.text}</Text>
                    )}
                  </View>
                  <View style={styles.bubbleArrow} />
                </View>
              </TouchableOpacity>
            </MapboxGL.MarkerView>
          );
        })}
      </MapboxGL.MapView>

      <Modal
        transparent
        visible={composerOpen}
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Create post</Text>
            <Text style={styles.sheetHint}>
              Post drops at your current location
            </Text>
            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder="What's up?"
              maxLength={120}
              style={styles.input}
              autoFocus
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setComposerOpen(false)}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={submitPost}>
                <Text style={{ color: 'white', fontWeight: '600' }}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cluster details modal */}
      <Modal
        transparent
        visible={!!selectedCluster}
        animationType="slide"
        onRequestClose={() => setSelectedCluster(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {selectedCluster?.length || 0} posts in this spot
            </Text>

            <View style={{ maxHeight: 320 }}>
              {selectedCluster?.map(p => {
                if (!p?.id || !p?.text) return null;
                return (
                  <View
                    key={p.id}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: '#e5e5e5'
                    }}
                  >
                    <Text style={{ fontSize: 15, color: '#111' }}>{p.text}</Text>
                    <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                      {p.created_at ? new Date(p.created_at).toLocaleTimeString() : ''}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setSelectedCluster(null)}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setComposerOpen(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '300',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  sheetHint: { color: '#666', marginBottom: 12, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1976D2',
    borderRadius: 10,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    minWidth: 80,
    maxWidth: 240,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ccc',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  bubbleText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '500',
  },
  bubbleArrow: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'white',
  },
});