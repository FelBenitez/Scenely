// app/(tabs)/map.jsx
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostSheet from '../../components/PostSheet';
import ComposerSheet from '../../components/ui/ComposerSheet';
import ConfettiBurst from '../../components/ui/ConfettiBurst';
import FAB from '../../components/ui/FAB';
import { hapticSuccess } from '../../components/ui/Haptics';
import Toast from '../../components/ui/Toast';
import TopBar from '../../components/ui/TopBar';
import { supabase } from '../../lib/supabase';
import PinMarker from '../../components/ui/PinMarker';


// Sprite(s) for post pins
const PIN_EVENT_100 = require('../../assets/images/pins/pin_event_100.png');


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

// Track previous positions for animation (outside component)
const prevPositionsMap = new Map();

// Helper: calculate distance in meters
function distanceInMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// MAKING HYBRID GPU PINS

// --- GPU base: derive freshness bucket + priority and build GeoJSON ---
function getMinutesLeft(created_at) {
  if (!created_at) return 0;
  const minsSince = (Date.now() - new Date(created_at).getTime()) / 60000;
  const left = 240 - minsSince; // 4h window
  return Math.max(0, Math.round(left));
}

function getFreshBucket(minutesLeft) {
  if (minutesLeft > 180) return 100;
  if (minutesLeft > 120) return 75;
  if (minutesLeft > 60)  return 50;
  if (minutesLeft > 30)  return 25;
  return 0; // "expiring"
}

// Simple priority (tune later / remote-config)
function computePriority(p, mapCenter = { latitude: 30.2849, longitude: -97.7341 }) {
  const minsLeft = getMinutesLeft(p.created_at);
  const freshnessScore = Math.max(0, minsLeft) * 200;
  const engagement = (p.reactions || 0) + 2 * (p.comments || 0);

  // rough distance penalty (don’t overthink; we’ll refine later)
  const dx = (p.lng - mapCenter.longitude) * Math.cos((mapCenter.latitude * Math.PI) / 180);
  const dy = (p.lat - mapCenter.latitude);
  const distScore = Math.max(0, 1000 - Math.sqrt(dx*dx + dy*dy) * 111000); // meters-ish

  const friendBoost = p.isFriend ? 100000 : 0;

  return friendBoost + freshnessScore + engagement * 150 + distScore;
}


/////




export default function MapTab() {
  const cameraRef = useRef(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const toastRef = useRef(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [draftText, setDraftText] = useState('');
  const [userLoc, setUserLoc] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const lastPostTime = useRef(0);
  const MAX_ONLINE_MIN = 10;

  // Live location
  const [shareLive, setShareLive] = useState(true); // toggle to share/halt heartbeat
  const [liveUsers, setLiveUsers] = useState([]);   // array of {user_id,lat,lng,last_seen,username,avatar_url}
  // [DEV] toggle for polling to save Supabase data during dev
  const [pollingActive, setPollingActive] = useState(false);
  const heartbeatRef = useRef(null);                // write loop interval
  const pollRef = useRef(null);                     // read loop interval
  const appState = useRef(AppState.currentState);   // pause in background

  // Animation state
  const [animatedPositions, setAnimatedPositions] = useState(new Map());
  const animationFrames = useRef(new Map());

  // config knobs
  const HEARTBEAT_MS = 20_000; // send position every 20s
  const POLL_MS = 20_000;      // refresh others every 20s
  const MAX_LIVE_MIN = 45;     // hide after 45 minutes
  // Buckets: live<=2, warm<=10, cooling<=30, else stale<=45(hidden)



  const [userId, setUserId] = useState(null);

  // Derived id as string for filtering the selected sprite out
  const selectedId = selectedPost?.id ? String(selectedPost.id) : null;
  
  // open PostSheet only when user confirms (second tap)
  const [sheetOpen, setSheetOpen] = useState(false);

  const [cameraInfo, setCameraInfo] = useState({
    center: [-97.7341, 30.2849],
    zoom: 14,
  });

  // threshold at which GPU -> React upgrade kicks in
  const UPGRADE_ZOOM = designMode ? 0 : 15;

  // DEV: live-design mode (force upgrades everywhere)
  const [designMode, setDesignMode] = useState(false);

  // Ensure upgrades always reset when you zoom out; they'll reappear when you zoom back in
  useEffect(() => {
    if (designMode) return; // <-- don't clear in design mode
    const z = cameraInfo?.zoom;
    if (typeof z === 'number' && z < UPGRADE_ZOOM) {
      setSelectedPost(null);
      setSheetOpen(false);
    }
  }, [cameraInfo?.zoom, designMode]);


  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, []);


  // Stable jitter based on user_id hash (FIXED: handles negative hashes)
  function stableJitter(userId, meters = 8) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }
    
    // Normalize to [0, 1] range (handles negative hashes)
    const normalized = ((hash % 10000) + 10000) % 10000 / 10000;
    const angle = normalized * Math.PI * 2;
    
    return {
      latOffset: Math.cos(angle) * (meters / 111000),
      lngOffset: Math.sin(angle) * (meters / 111000),
    };
  }

  // snap to ~25m grid + stable jitter for privacy
  function coarseAndJitter(lat, lng, userId) {
    const meters = 25;
    const latStep = meters / 111000; // deg lat per 25m
    const lngStep = meters / (111000 * Math.cos((lat * Math.PI) / 180));

    const latCoarse = Math.round(lat / latStep) * latStep;
    const lngCoarse = Math.round(lng / lngStep) * lngStep;

    // Stable jitter - same user always gets same offset
    const { latOffset, lngOffset } = stableJitter(userId, 8);
    const lngOffsetCorrected = lngOffset / Math.cos((lat * Math.PI) / 180);

    const latJ = latCoarse + latOffset;
    const lngJ = lngCoarse + lngOffsetCorrected;
    const gridId = `${Math.round(latCoarse/latStep)}:${Math.round(lngCoarse/lngStep)}`;
    return { lat: latJ, lng: lngJ, gridId };
  }



  // Online Count 
  const insets = useSafeAreaInsets();

  const onlineCount = useMemo(() => {
    const now = Date.now();
    return liveUsers.filter(u => {
      if (!u?.last_seen) return false;
      const mins = (now - new Date(u.last_seen).getTime()) / 60000;
      return mins <= MAX_ONLINE_MIN;
    }).length;
  }, [liveUsers]);






// Which posts should “upgrade” into React markers right now?
// const upgradeIds = useMemo(() => {
//   const { center, zoom } = cameraInfo;
//   if (!center || typeof zoom !== 'number') return [];

//   // Only upgrade when fairly zoomed in
//   if (zoom < 15) return [];

//   const centerLng = center[0];
//   const centerLat = center[1];

//   // score: priority first, then closeness to center; within ~600m
//   const scored = (posts || [])
//     .filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
//     .map(p => {
//       const dist = distanceInMeters(p.lat, p.lng, centerLat, centerLng);
//       const pr = computePriority(p, { latitude: centerLat, longitude: centerLng });
//       return { id: String(p.id), post: p, dist, pr };
//     })
//     .filter(x => x.dist <= 600);

//   scored.sort((a, b) => {
//     if (b.pr !== a.pr) return b.pr - a.pr;
//     return a.dist - b.dist;
//   });

//   // keep it small for perf (6–10 is good)
//   const top = scored.slice(0, 8).map(x => x.id);

//   // always include the focused post if any
//   if (selectedPost?.id && !top.includes(String(selectedPost.id))) {
//     top.unshift(String(selectedPost.id));
//   }
//   return top;
// }, [posts, cameraInfo, selectedPost]);

// upgradeIDs with designing mode
const upgradeIds = useMemo(() => {
  const { center, zoom } = cameraInfo;
  if (!center || typeof zoom !== 'number') return [];

  // Only gate by zoom when NOT in design mode
  if (!designMode && zoom < UPGRADE_ZOOM) return [];

  const centerLng = center[0];
  const centerLat = center[1];

  // Wider net in design mode (no 600m cutoff, and larger cap)
  const maxDistMeters = designMode ? Infinity : 600;
  const cap = designMode ? 20 : 8;

  const scored = (posts || [])
    .filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    .map(p => {
      const dist = distanceInMeters(p.lat, p.lng, centerLat, centerLng);
      const pr = computePriority(p, { latitude: centerLat, longitude: centerLng });
      return { id: String(p.id), post: p, dist, pr };
    })
    .filter(x => x.dist <= maxDistMeters);

  scored.sort((a, b) => (b.pr !== a.pr ? b.pr - a.pr : a.dist - b.dist));

  const top = scored.slice(0, cap).map(x => x.id);
  if (selectedPost?.id && !top.includes(String(selectedPost.id))) {
    top.unshift(String(selectedPost.id));
  }
  return top;
}, [posts, cameraInfo, selectedPost, designMode, UPGRADE_ZOOM]);

// Hide upgraded ids from the GPU sprite layer
const spriteFilter = useMemo(() => {
  const base = ['!', ['has', 'point_count']]; // only real features
  if (!upgradeIds || upgradeIds.length === 0) return base;
  // hide any features whose id is in upgradeIds
  return ['all', base, ['!', ['in', ['get', 'id'], ['literal', upgradeIds]]]];
}, [upgradeIds]);


  // Memoized GeoJSON for posts -> Mapbox ShapeSource
const postsGeoJSON = useMemo(() => {
  const center = userLoc ?? { latitude: 30.2849, longitude: -97.7341 };
  return {
    type: 'FeatureCollection',
    features: (posts || [])
      .filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
      .map(p => {
        const minutesLeft = getMinutesLeft(p.created_at);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: {
            id: String(p.id),
            category: p.category || 'event',
            minutesLeft,
            freshBucket: getFreshBucket(minutesLeft), // for sprite variant later
            priority: computePriority(p, center),
          },
        };
      }),
  };
}, [posts, userLoc]);



  // helper: classify by age (minutes)
  function classifyAge(mins) {
    if (mins <= 2) return { bucket: 'live', opacity: 1, label: 'Live' };
    if (mins <= 10) return { bucket: 'warm', opacity: 0.9, label: `${Math.round(mins)}m` };
    if (mins <= 30) return { bucket: 'cooling', opacity: 0.7, label: `${Math.round(mins)}m` };
    if (mins <= MAX_LIVE_MIN) return { bucket: 'stale', opacity: 0.5, label: `~${Math.round(mins)}m` };
    return { bucket: 'hide', opacity: 0, label: '' };
  }

  // Memoize clusters (use current latitude for accurate lng meters)
  const clusters = useMemo(
    () => clusterPosts(posts, userLoc?.latitude ?? 30.28),
    [posts, userLoc?.latitude]
  );

  useEffect(() => {
    console.log(
      `📍 Location sharing: ${shareLive ? 'ON' : 'OFF'} | 🔁 Polling: ${pollingActive ? 'ON' : 'OFF, NOT SENDING OR RECEIVING!!!!'}`
    );
  }, [pollingActive, shareLive]);

  // Get user location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const { coords } = await Location.getCurrentPositionAsync({});
          setUserLoc({ latitude: coords.latitude, longitude: coords.longitude });
        } else {
          Alert.alert(
            'Location Required',
            'Please enable location to share your position and see others nearby.',
            [{ text: 'OK' }]
          );
          setShareLive(false); // Disable sharing if no permission
        }
      } catch (error) {
        console.error('Error getting location:', error);
        Alert.alert('Location Error', 'Could not get your location. Please try again.');
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
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'posts' },
            payload => {
              try {
                const deleted = payload.old;
                if (!deleted?.id) return;
                setPosts(prev => prev.filter(p => p.id !== deleted.id));
                // If the currently open sheet is this post, close it
                setSelectedPost(curr => (curr?.id === deleted.id ? null : curr));
              } catch (err) {
                console.error('Error handling realtime delete:', err);
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

  // [LIVELOC] WRITE: heartbeat your coarse+jittered location every 20s
  async function sendHeartbeat() {
    try {
      // if we don't have a cached location, try once (non-blocking)
      let lat = userLoc?.latitude;
      let lng = userLoc?.longitude;
      if (lat == null || lng == null) {
        const { coords } = await Location.getCurrentPositionAsync({});
        lat = coords.latitude;
        lng = coords.longitude;
      }
      if (lat == null || lng == null) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const coarse = coarseAndJitter(lat, lng, user.id); // Pass user.id for stable jitter

      const { error } = await supabase
        .from('live_locations')
        .upsert({
          user_id: user.id,
          lat: coarse.lat,
          lng: coarse.lng,
          grid_id: coarse.gridId,
          last_seen: new Date().toISOString(),
        });

      if (error) {
        console.error('[LiveLoc] Heartbeat failed:', error.message);
      }
    } catch (e) {
      console.error('[LiveLoc] Heartbeat error:', e);
    }
  }

  // [LIVELOC] READ: poll nearby users every 20s (last <= 60min; hide > 45min in UI)
  async function pollNearby() {
    try {
      // simple bounding box around current user to trim payload
      const center = userLoc ?? { latitude: 30.2849, longitude: -97.7341 };
      const latPad = 0.2; // ~22km; tune for campus size
      const lngPad = 0.2;

      const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last 60 min

      const { data, error } = await supabase
        .from('live_locations')
        .select('user_id, lat, lng, last_seen, username, avatar_url')
        .gt('last_seen', sinceIso)
        .gte('lat', center.latitude - latPad)
        .lte('lat', center.latitude + latPad)
        .gte('lng', center.longitude - lngPad)
        .lte('lng', center.longitude + lngPad)
        .limit(2000);

      if (error) {
        console.error('[LiveLoc] Poll failed:', error.message);
        return;
      }

      if (Array.isArray(data)) {
        setLiveUsers(data);
      }
    } catch (e) {
      console.error('[LiveLoc] Poll error:', e);
    }
  }

  // [LIVELOC] start/stop loops depending on app state and toggle
  useEffect(() => {
    const onAppStateChange = (state) => {
      const goingBg = appState.current.match(/active/) && state.match(/inactive|background/);
      appState.current = state;
      if (goingBg) {
        // pause loops
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (state === 'active' && shareLive && pollingActive) {
        // resume
        sendHeartbeat();
        pollNearby();
        heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);
        pollRef.current = setInterval(pollNearby, POLL_MS);
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [shareLive, pollingActive]);

  

  // [LIVELOC] boot loops when mounted (and sharing on)
  useEffect(() => {
    if (!shareLive || !pollingActive) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    sendHeartbeat();
    pollNearby();
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);
    pollRef.current = setInterval(pollNearby, POLL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [shareLive, pollingActive]);

  // Animate position changes only when users move
  useEffect(() => {
    liveUsers.forEach(u => {
      if (!Number.isFinite(u?.lat) || !Number.isFinite(u?.lng)) return;
      
      const prev = prevPositionsMap.get(u.user_id);
      
      if (!prev) {
        // First time seeing this user - no animation
        prevPositionsMap.set(u.user_id, { lat: u.lat, lng: u.lng });
        setAnimatedPositions(map => new Map(map).set(u.user_id, { lat: u.lat, lng: u.lng }));
        return;
      }
      
      // Check if they moved (threshold: 5 meters to avoid GPS noise)
      const dist = distanceInMeters(prev.lat, prev.lng, u.lat, u.lng);
      
      if (dist < 5) {
        // Didn't move - keep old position, no animation
        return;
      }
      
      // They moved - animate from prev to new
      const startTime = Date.now();
      const duration = 1500; // 1.5 seconds
      
      // Cancel any existing animation for this user
      if (animationFrames.current.has(u.user_id)) {
        cancelAnimationFrame(animationFrames.current.get(u.user_id));
      }
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        
        const lat = prev.lat + (u.lat - prev.lat) * eased;
        const lng = prev.lng + (u.lng - prev.lng) * eased;
        
        setAnimatedPositions(map => new Map(map).set(u.user_id, { lat, lng }));
        
        if (progress < 1) {
          animationFrames.current.set(u.user_id, requestAnimationFrame(animate));
        } else {
          // Animation complete - update prev position
          prevPositionsMap.set(u.user_id, { lat: u.lat, lng: u.lng });
          animationFrames.current.delete(u.user_id);
        }
      };
      
      requestAnimationFrame(animate);
    });
    
    // Cleanup users who left
    const currentIds = new Set(liveUsers.map(u => u.user_id));
    Array.from(prevPositionsMap.keys()).forEach(id => {
      if (!currentIds.has(id)) {
        prevPositionsMap.delete(id);
        animationFrames.current.delete(id);
        setAnimatedPositions(map => {
          const newMap = new Map(map);
          newMap.delete(id);
          return newMap;
        });
      }
    });
  }, [liveUsers]);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      animationFrames.current.forEach(frame => cancelAnimationFrame(frame));
    };
  }, []);

  const submitPostExtended = async (textIn, category = 'freebies', photoUri = null) => {
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

      const text = (textIn ?? draftText).trim();
      if (!text) return;

      const { data, error } = await supabase
      .from('posts')
      .insert([{
        text,
        lat,
        lng,
        category,             // <- from composer
        photo_url: null       // <- replace with uploaded URL when you wire photos
        // expires_at will auto-default to +4h
      }])
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
        // setComposerOpen(false);

        cameraRef.current?.setCamera({
          centerCoordinate: [lng, lat],
          zoomLevel: 16,
          animationDuration: 500,
        });
        
        // celebration
        hapticSuccess();
        toastRef.current?.show('Dropped! Visible for 4h 🎉');
        setConfettiKey(k => k + 1);
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
        scaleBarEnabled={false}
        onCameraChanged={(e) => {
          const { zoom, center } = e?.properties ?? {};
          if (Array.isArray(center) && typeof zoom === 'number') {
            setCameraInfo({ center, zoom });
          }
        }}
        onPress={() => { setSelectedPost(null); setSheetOpen(false); }}
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



        {/* REGISTER PIN SPRITES ONCE */}
        <MapboxGL.Images
          images={{
            // temp: one key points to one sprite file
            pin_event_100: PIN_EVENT_100, // key used by SymbolLayer
          }}
        />


        {/* POSTS via GPU layers (fast) */}
      <MapboxGL.ShapeSource
        id="posts-src"
        shape={postsGeoJSON}
        // start with no clustering; we’ll add later once sprites are in
        cluster={false}
    
        onPress={(e) => {
        const f = e?.features?.[0];
        if (!f) return;
        const id = f.properties?.id;
        const post = posts.find(p => String(p.id) === id);
        if (!post) return;

        // First tap focuses (upgrades pin). Second tap opens sheet.
        if (selectedPost && String(selectedPost.id) === String(post.id)) {
          setSheetOpen(true); // second tap -> open sheet
        } else {
          setSelectedPost(post);   // focus/upgrade
          setSheetOpen(false);     // don't open sheet yet
        }
}}
      >
        {/* TEARDROP SYMBOLS (using the one test sprite for all posts right now) */}
      <MapboxGL.SymbolLayer
      id="posts-symbols"
      filter={spriteFilter}
      style={{
        iconImage: 'pin_event_100',
        iconSize: [
          'interpolate', ['linear'], ['zoom'],
          12, 0.10,
          14, 0.12,
          16, 0.14,
          18, 0.16,
        ],
        iconAnchor: 'bottom',
        iconPitchAlignment: 'viewport',
        iconAllowOverlap: false,
        iconIgnorePlacement: false,
        symbolSortKey: ['get', 'priority'],
      }}
    />

        {/* Tiny “Xm” label for expiring posts (<= 30 min) */}
        <MapboxGL.SymbolLayer
          id="posts-expiring-label"
          filter={[
            'all',
            ['!', ['has', 'point_count']],
            ['<=', ['get', 'minutesLeft'], 30],
            ['>',  ['get', 'minutesLeft'], 0],
          ]}
          style={{
            textField: ['concat', ['to-string', ['get', 'minutesLeft']], 'm'],
            textSize: 11,
            textColor: '#1A1A1A',
            textHaloColor: '#FFFFFF',
            textHaloWidth: 1.5,
            textAllowOverlap: false,
            textOffset: [0, -1.6], // nudge above the circle a bit
          }}
        />
      </MapboxGL.ShapeSource>

      {/* Upgrade layer: show PinMarker for top-N */}
      {upgradeIds.map(uid => {
        const p = posts.find(pp => String(pp.id) === uid);
        if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return null;
        return (
          <MapboxGL.MarkerView
            key={`up-${uid}`}
            id={`up-${uid}`}
            coordinate={[p.lng, p.lat]}
            anchor={{ x: 0.5, y: 1 }}
          >
            <PinMarker
              post={p}
              selected={selectedPost && String(selectedPost.id) === uid}
              onPress={() => {
                if (selectedPost && String(selectedPost.id) === uid) {
                  setSheetOpen(true);
                } else {
                  setSelectedPost(p);
                  setSheetOpen(false);
                }
              }}
            />
          </MapboxGL.MarkerView>
        );
      })}












        {/* [LIVELOC] render live users with age buckets */}
        {liveUsers.map((u) => {
          if (!Number.isFinite(u?.lat) || !Number.isFinite(u?.lng) || !u?.last_seen) return null;
          
          const mins = (Date.now() - new Date(u.last_seen).getTime()) / 60000;
          const { bucket, opacity, label } = classifyAge(mins);
          if (bucket === 'hide') return null;
          
          // Use animated position if available, otherwise use raw position
          const pos = animatedPositions.get(u.user_id) || { lat: u.lat, lng: u.lng };
          
          const showAvatar = !!u.avatar_url;
          
          return (
            <MapboxGL.MarkerView
              key={`live-${u.user_id}`}
              id={`live-${u.user_id}`}
              coordinate={[pos.lng, pos.lat]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={{ alignItems: 'center', opacity }}>
                <View style={[
                  styles.liveBadge,
                  bucket === 'live' && styles.liveSolid,
                  bucket === 'warm' && styles.liveWarm,
                  bucket === 'cooling' && styles.liveCooling,
                  bucket === 'stale' && styles.liveStale,
                ]}>
                  {showAvatar ? (
                    <View style={styles.avatarCircle}>
                      <MapboxGL.Images images={{}} />{/* placeholder to avoid warnings */}
                      <View style={styles.avatarWrap}>
                        {/* RN <Image> inside marker */}
                        <View style={styles.avatarImgWrap}>
                          <Text style={{display:'none'}}>{u.username ?? ''}</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.dot}/>
                  )}
                </View>
                <Text style={styles.liveLabel}>{label}</Text>
              </View>
            </MapboxGL.MarkerView>
          );
        })}

        {/* {clusters.map((cluster, idx) => {
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
                  if (cluster.length === 1) {
                    setSelectedPost(cluster[0]);
                  } else {
                    setSelectedCluster(cluster);
   }
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
        })} */}



      </MapboxGL.MapView>


      {/* Floating top bar*/}
      <View 
        style={{ 
          position: 'absolute', 
          top: insets.top + 8, 
          left: 12, 
          right: 12, 
          zIndex: 999,
          pointerEvents: 'box-none' // Allow touches to pass through to map
        }}
      >
        <TopBar
          sharing={shareLive}
          onlineCount={onlineCount}
          onToggle={(next) => {
            setShareLive(next);
            if (next && pollingActive) {
              sendHeartbeat();
              pollNearby();
            }
          }}
          onFilterPress={() => {
            console.log('Filter pressed');
          }}
        />
      </View>

      {/* <Modal
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
      </Modal> */}



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

       <View style={{ maxHeight: 360 }}>
         {selectedCluster?.map(p => {
           if (!p?.id || !p?.text) return null;
           return (
             <TouchableOpacity
               key={p.id}
               activeOpacity={0.8}
               onPress={() => {
                 setSelectedPost(p); // open this one
                 setSelectedCluster(null); // close the list
               }}
             >
               <View
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
             </TouchableOpacity>
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

     <PostSheet
   post={sheetOpen ? selectedPost : null}
   onClose={() => { setSheetOpen(false); setSelectedPost(null); }}
   userId={userId}
 />

      {/* Designing button */}
      <TouchableOpacity
      style={[
        styles.fab,
        { right: 16, bottom: 104, backgroundColor: designMode ? '#8B5CF6' : '#9CA3AF' },
      ]}
      onPress={() => setDesignMode(v => !v)}
    >
      <Text style={{ color: 'white', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
        {designMode ? 'Design\nON' : 'Design\nOFF'}
      </Text>
    </TouchableOpacity>

      {/* [DEV] Polling toggle */}
      <TouchableOpacity
        style={[
          styles.fab,
          { left: 16, bottom: 24, backgroundColor: pollingActive ? '#22c55e' : '#9CA3AF' },
        ]}
        onPress={() => setPollingActive((p) => !p)}
      >
        <Text style={styles.fabText}>
          {pollingActive ? 'Polling' : 'Not polling'}
        </Text>
      </TouchableOpacity>

      {/* [LIVELOC] quick toggle for share */}
      <TouchableOpacity
        style={[styles.fab, { right: 96, backgroundColor: shareLive ? '#1976D2' : '#9CA3AF' }]}
        onPress={() => setShareLive(s => !s)}
      >
        <Text style={styles.fabText}>{shareLive ? 'On' : 'Off'}</Text>
      </TouchableOpacity>

      {/* <TouchableOpacity
        style={styles.fab}
        onPress={() => setComposerOpen(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity> */}

      {/* Composer (bottom sheet) */}
      <ComposerSheet
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSubmit={async ({ text, category, photoUri }) => {
          setComposerOpen(false);
          // call your existing submit logic, extended for category/photo
          await submitPostExtended(text, category, photoUri);
        }}
      />

      {/* Toast + Confetti overlays */}
      <Toast ref={toastRef} />
      <ConfettiBurst fire={confettiKey} />

      {/* Primary FAB */}
      <FAB visible={!composerOpen} onPress={() => setComposerOpen(true)} />


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
    backgroundColor: '#BF5700',
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

  // [LIVELOC] styles
  liveBadge: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  liveSolid:   { backgroundColor: '#22c55e' }, // green
  liveWarm:    { backgroundColor: '#f59e0b' }, // amber
  liveCooling: { backgroundColor: '#60a5fa' }, // blue
  liveStale:   { backgroundColor: '#9ca3af' }, // gray
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: 'white' },
  liveLabel: { marginTop: 4, fontSize: 11, color: '#111' },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  avatarWrap: { flex: 1 },
  avatarImgWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' },
});