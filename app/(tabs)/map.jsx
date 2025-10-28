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
import PinMarker, { categoryTint } from '../../components/ui/PinMarker';
import SpotMarker from '../../components/ui/SpotMarker';
import PetalMarker from '../../components/ui/PetalMarker';
import SpotFeedSheet from '../../components/SpotFeedSheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LiveMarker from '../../components/ui/LiveMarker';
import LiveClusterMarker from '../../components/ui/LiveClusterMarker';
import { groupLiveUsers } from '../../utils/liveGroups';
import { LIVE_GROUP_RADIUS_M, RING_BY_BUCKET } from '../../constants/map';
import LiveRingMarker from '../../components/ui/LiveRingMarker';
import LiveClusterSheet from '../../components/LiveClusterSheet';


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

// Format meters -> short miles label
function formatMilesLabel(meters) {
  const miles = meters / 1609.344;
  if (miles < 0.1) return '0.1 mi';
  if (miles < 1)   return `${miles.toFixed(1)} mi`;
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded.toFixed(1)} mi`;
}

// Build distance label for a cluster of posts
function distanceLabelForCluster(cluster, userLoc) {
  if (!Array.isArray(cluster) || cluster.length === 0 || !userLoc) return '';
  // use centroid of the cluster (safe if all same spot)
  const lat = cluster.reduce((s, p) => s + (p.lat || 0), 0) / cluster.length;
  const lng = cluster.reduce((s, p) => s + (p.lng || 0), 0) / cluster.length;
  const meters = distanceInMeters(userLoc.latitude, userLoc.longitude, lat, lng);
  return formatMilesLabel(meters);
}

// Live user clustering (minutesSince, youngestMinutes, sortByRecency)
function minutesSince(ts) {
  return Math.max(0, Math.round((Date.now() - new Date(ts || Date.now()).getTime()) / 60000));
}

function youngestMinutes(members) {
  if (!members?.length) return Infinity;
  return Math.min(...members.map(m => minutesSince(m.last_seen)));
}

// Most recent first
function sortByRecency(members) {
  return members.slice().sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());
}

// Petal offset positions (in pixels) for different counts
// These are relative to the hero's center
function getPetalOffsets(count) {
  const RADIUS = 22; // Distance from hero center
  
  switch (count) {
    case 2:
      // Left and right
      return [
        { x: -RADIUS, y: 0 },
        { x: RADIUS, y: 0 },
      ];
    case 3:
      // Triangle: top-left, top-right, bottom
      return [
        { x: -RADIUS * 0.866, y: -RADIUS * 0.5 },
        { x: RADIUS * 0.866, y: -RADIUS * 0.5 },
        { x: 0, y: RADIUS },
      ];
    case 4:
      // Square: corners
      return [
        { x: -RADIUS * 0.707, y: -RADIUS * 0.707 },
        { x: RADIUS * 0.707, y: -RADIUS * 0.707 },
        { x: -RADIUS * 0.707, y: RADIUS * 0.707 },
        { x: RADIUS * 0.707, y: RADIUS * 0.707 },
      ];
    default:
      // 5: Pentagon
      return [
        { x: 0, y: -RADIUS },
        { x: RADIUS * 0.951, y: -RADIUS * 0.309 },
        { x: RADIUS * 0.588, y: RADIUS * 0.809 },
        { x: -RADIUS * 0.588, y: RADIUS * 0.809 },
        { x: -RADIUS * 0.951, y: -RADIUS * 0.309 },
      ];
  }
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

// --- Expiration helpers for progress ring (used by PinMarker) ---
function minutesLeftForPost(p, totalMinutesDefault = 240) {
  const now = Date.now();
  const createdMs = p?.created_at ? new Date(p.created_at).getTime() : now;
  const expiresMs = p?.expires_at
    ? new Date(p.expires_at).getTime()
    : createdMs + totalMinutesDefault * 60_000;

  const leftMs = Math.max(0, expiresMs - now);
  return Math.round(leftMs / 60_000);
}

function totalMinutesForPost(p, fallback = 240) {
  if (p?.expires_at && p?.created_at) {
    const start = new Date(p.created_at).getTime();
    const end   = new Date(p.expires_at).getTime();
    const mins  = Math.max(1, Math.round((end - start) / 60_000));
    return mins;
  }
  return fallback;
}

// Within ~6–8px at current zoom looks identical. Use small epsilon in degrees.
const EPSILON_DEG = 0.00002; // ~2m at Austin latitude. Tweak if needed.

// Returns array of { lng, lat, posts: Post[], hero: Post, count: number }
function buildSpotStacks(sourcePosts) {
  const groups = [];
  const visited = new Set();

  // naive O(n^2) with tiny n (only upgraded posts) → fine
  for (let i = 0; i < sourcePosts.length; i++) {
    const a = sourcePosts[i];
    if (!a || visited.has(a.id)) continue;

    const bucket = [a];
    visited.add(a.id);

    for (let j = i + 1; j < sourcePosts.length; j++) {
      const b = sourcePosts[j];
      if (!b || visited.has(b.id)) continue;
      if (Math.abs(a.lat - b.lat) <= EPSILON_DEG && Math.abs(a.lng - b.lng) <= EPSILON_DEG) {
        bucket.push(b);
        visited.add(b.id);
      }
    }

    // pick hero (freshness > friend > engagement > recency)
    const hero = pickHero(bucket);
    groups.push({
      lng: a.lng,
      lat: a.lat,
      posts: bucket,
      hero,
      count: bucket.length,
    });
  }
  return groups;
}

function pickHero(arr) {
  const score = (p) => {
    const minsLeft = getMinutesLeft(p.created_at);
    const friendBoost = p.isFriend ? 100000 : 0;
    const engagement = (p.reactions || 0) + 2 * (p.comments || 0);
    const freshness = Math.max(0, minsLeft) * 200;
    const recency = new Date(p.created_at || 0).getTime();
    return friendBoost + freshness + engagement * 150 + recency * 0.0001;
  };
  return arr.slice().sort((a, b) => score(b) - score(a))[0];
}

// ---- Flower (petals) helpers ----
// When to show petals
const FLOWER_MIN_ZOOM = 16.5;
// Max # of petals shown around the hero
const FLOWER_MAX_PETALS = 5;
// Petal radius in screen pixels from hero center
const FLOWER_RADIUS_PX = 12;

// Angles to use (degrees from 12 o'clock, clockwise) by petal count
// We rotate these slightly per-spot using a tiny seed so stacks don't all look identical.
function baseAnglesForCount(n) {
  // n = number of petals (not including hero)
  switch (n) {
    case 1: return [0];                        // top
    case 2: return [315, 45];                  // top-right, top-left
    case 3: return [0, 120, 240];
    case 4: return [0, 72, 144, 216];
    default: return [0, 72, 144, 216, 288];    // 5+
  }
}

// Tiny stable rotation seed per spot (±8°)
function rotationSeedDeg(lng, lat) {
  const s = `${lng.toFixed(5)},${lat.toFixed(5)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  // map to [-8, +8]
  return ((h % 17) - 8);
}

// RNMapbox uses 512px tiles. Meters per pixel at a latitude for a given zoom.
function metersPerPixel(zoom, lat) {
  const EARTH_RADIUS = 6378137;         // meters
  const TILE_SIZE = 512;                 // Mapbox GL
  return (Math.cos(lat * Math.PI / 180) * 2 * Math.PI * EARTH_RADIUS) / (TILE_SIZE * Math.pow(2, zoom));
}

// Convert a pixel offset (dx,dy) at the current zoom into a new [lng, lat] near a base coordinate.
// dx is to the right, dy is downward (screen coords). We'll invert dy for geographic "north is up".
function offsetCoordByPixels({ lng, lat }, dxPx, dyPx, zoom) {
  const mpp = metersPerPixel(zoom, lat);
  const dxMeters = dxPx * mpp;
  const dyMeters = dyPx * mpp;

  const dLat = ( -dyMeters ) / 111000; // -dy: screen down is south; geographic north is up
  const dLng = dxMeters / (111000 * Math.cos(lat * Math.PI / 180));

  return [lng + dLng, lat + dLat];
}

// Score for petals (reuse hero logic but without the huge friend bonus dominance)
function petalScore(p) {
  const minsLeft = getMinutesLeft(p.created_at);
  const friendBoost = p.isFriend ? 10000 : 0; // smaller than hero's, still noticeable
  const engagement = (p.reactions || 0) + 2 * (p.comments || 0);
  const freshness = Math.max(0, minsLeft) * 200;
  const recency = new Date(p.created_at || 0).getTime();
  return friendBoost + freshness + engagement * 150 + recency * 0.0001;
}

// Given a spot (hero + bucket) and camera zoom, return petal definitions with coordinates.
function buildPetalsForSpot(spot, zoom) {
  const { hero, posts, count, lat, lng } = spot;
  if (count < 2 || typeof zoom !== 'number' || zoom < FLOWER_MIN_ZOOM) return [];

  // Choose up to N best petals excluding hero
  const candidates = posts.filter(p => String(p.id) !== String(hero.id));
  candidates.sort((a, b) => petalScore(b) - petalScore(a));
  const petals = candidates.slice(0, FLOWER_MAX_PETALS);

  const n = petals.length;
  if (n === 0) return [];

  const baseAngles = baseAnglesForCount(n);
  const seed = rotationSeedDeg(lng, lat);

  // Convert angles & radius to pixel offsets, then to coordinates
  return petals.map((p, i) => {
    const deg = baseAngles[i] + seed;
    const rad = (deg * Math.PI) / 180;
    const dx = Math.sin(rad) * FLOWER_RADIUS_PX; // +x is right
    const dy = -Math.cos(rad) * FLOWER_RADIUS_PX; // +y is down; cos gives up, so negate

    const [plng, plat] = offsetCoordByPixels({ lng, lat }, dx, dy, zoom);

    return {
      post: p,
      coordinate: [plng, plat],
      angleDeg: deg,
    };
  });
}


// Fetch a user's avatar_url from profiles (used for realtime inserts)
async function fetchAvatarForUser(user_id) {
  try {
    if (!user_id) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_url, username')
      .eq('id', user_id)
      .single();
    if (error) {
      console.error('[profiles] fetch avatar failed:', error.message);
      return null;
    }
    return data?.avatar_url || null;
  } catch (e) {
    console.error('[profiles] fetch avatar error:', e);
    return null;
  }
}

// Upload a local image (expo-image-picker URI) to Supabase Storage and return a public URL
async function uploadPhotoAsync(localUri, userId) {
  try {
    if (!localUri) return null;

    // Extract file extension from URI
    const ext = localUri.split('.').pop().toLowerCase();
    const mimeTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      heic: 'image/heic',
      heif: 'image/heif',
    };
    const mime = mimeTypes[ext] || 'image/jpeg';

    // Unique path: userId/epoch.ext
    const filePath = `${userId || 'anon'}/${Date.now()}.${ext}`;

    // For React Native, we need to use FormData or read as ArrayBuffer
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    // Upload using the byte array
    const { error: upErr } = await supabase
      .storage
      .from('post-photos')
      .upload(filePath, fileData, { 
        contentType: mime, 
        upsert: false 
      });

    if (upErr) {
      console.error('[uploadPhotoAsync] upload error:', upErr.message);
      return null;
    }

    // Get a public URL (bucket is public per policy)
    const { data: pub } = supabase
      .storage
      .from('post-photos')
      .getPublicUrl(filePath);

    return pub?.publicUrl || null;
  } catch (e) {
    console.error('[uploadPhotoAsync] unexpected error:', e);
    return null;
  }
}


// Marker occlusion defaults
const UPGRADE_ZOOM = 15.0;                 // where posts switch to JSX
const COLLISION_THRESHOLD_PX = 12;         // screen-space collision radius
const LIVE_NUDGE_OFFSET = { x: 16, y: -8 };// right + up
const POST_SCALE_NEAR_THRESHOLD = 0.92;    // slight shrink near threshold
const LIVE_ZINDEX = 100;                   // live > posts
const POST_ZINDEX = 50;                    // posts < live

// Add near the top of map.jsx with other helper functions
function screenDistancePx(coord1, coord2, zoom, refLat) {
  const mpp = metersPerPixel(zoom, refLat);
  const meters = distanceInMeters(coord1.lat, coord1.lng, coord2.lat, coord2.lng);
  return meters / mpp;
}

function detectCollisions(upgradedSpots, liveGroups, zoom, thresholdPx = 12) {
  const collisions = new Map(); // liveGroupIndex -> { spot, offsetX, offsetY }
  
  liveGroups.forEach((liveGroup, liveIdx) => {
    upgradedSpots.forEach(spot => {
      const distPx = screenDistancePx(
        { lat: liveGroup.lat, lng: liveGroup.lng },
        { lat: spot.lat, lng: spot.lng },
        zoom,
        liveGroup.lat
      );
      
      if (distPx < thresholdPx) {
        // Collision detected - nudge live ring 16px right + 8px up
        collisions.set(liveIdx, { 
          spot, 
          offsetX: 16, 
          offsetY: -8 
        });
      }
    });
  });
  
  return collisions;
}


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

  // movement + timing control
  const locWatchRef = useRef(null);           // expo-location subscription
  const lastDeviceCoordRef = useRef(null);    // { lat, lng } from watchPosition
  const lastHeartbeatAtRef = useRef(0);       // ms timestamp of last write
  const lastHeartbeatCoordRef = useRef(null); // last sent coord (after coarse/jitter)

  // polling backoff (seconds)
  const [pollIntervalMs, setPollIntervalMs] = useState(20_000); // backs off when idle
  const MIN_MOVE_METERS = 20;       // only react if you moved more than this
  const HEARTBEAT_MIN_INTERVAL = 60_000; // always send at least once a minute


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


  // Live cluster display thresholds
  const LIVE_COUNT_ONLY_ZOOM = 15;   // below this -> count bubble
  // Petals should appear as soon as we’re not in countOnly mode
  const LIVE_FLOWER_MIN_ZOOM = LIVE_COUNT_ONLY_ZOOM;
  const LIVE_PETAL_MAX = 5;          // up to 5 petals
  const [liveClusterSheet, setLiveClusterSheet] = useState(null); // { lat, lng, members }

  // Global minute tick (keeps PinMarker progress cheap and in sync)
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

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



  const router = useRouter();
  const params = useLocalSearchParams();

  // Recenter/focus when arriving with params from Feed
  useEffect(() => {
   const { lat, lng, zoom, focusId } = params || {};
   const hasCoords = lat != null && lng != null;
   if (!hasCoords && !focusId) return;

   const latNum  = hasCoords ? parseFloat(String(lat))  : undefined;
   const lngNum  = hasCoords ? parseFloat(String(lng))  : undefined;
   const zoomNum = zoom != null ? parseFloat(String(zoom)) : 17;

   if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
     recenterTo({ lat: latNum, lng: lngNum, zoom: zoomNum });
   }

   if (focusId) {
     const p = posts.find(x => String(x.id) === String(focusId));
     if (p) {
       setSelectedPost(p);
       setSheetOpen(false); // tap behavior: focus first; open sheet on second tap if you prefer
     }
   }

   // Clear params so it won't retrigger when map state updates
   try { router.setParams({ lat: undefined, lng: undefined, zoom: undefined, focusId: undefined }); } catch {}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [params, posts]);


  useEffect(() => {
  let channel;

  const handler = async (payload) => {
    console.log('[RT posts] change:', payload?.eventType, payload?.new?.id);
  };

  channel = supabase
    .channel('realtime:public:posts') // name can be anything
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'posts' },
      handler
    )
    .subscribe((status) => {
      console.log('[RT posts] status:', status); // 'SUBSCRIBED' is what you want
    });

  return () => {
    supabase.removeChannel(channel).catch(()=>{});
  };
}, []);


  // live device location subscription (cheap + accurate)
  useEffect(() => {
    // clean up helper
    const stop = () => {
      try { locWatchRef.current?.remove?.(); } catch {}
      locWatchRef.current = null;
    };

    if (!shareLive) { stop(); return; }

    (async () => {
      try {
        // ensure permission (already asked once, but this is safe)
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { stop(); return; }

        // subscribe: accuracy balanced, update on ~20–25m or ~20s
        locWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 20, // meters
            timeInterval: 20_000, // ms (iOS may ignore if stationary)
            mayShowUserSettingsDialog: false,
          },
          (loc) => {
            if (!loc?.coords) return;
            const { latitude, longitude } = loc.coords;

            // keep a live copy for heartbeat decisions
            lastDeviceCoordRef.current = { latitude, longitude };

            // also keep your userLoc (used elsewhere)
            setUserLoc({ latitude, longitude });

            // if we moved materially OR it's been > 60s, send heartbeat
            maybeSendHeartbeat();
          }
        );
      } catch (e) {
        console.warn('[LiveLoc] watchPosition error:', e?.message || e);
        stop();
      }
    })();

    return stop;
  }, [shareLive]);

  

  function recenterTo({ lng, lat, zoom = 17 }) {
  cameraRef.current?.setCamera({
    centerCoordinate: [lng, lat],
    zoomLevel: zoom,
    animationDuration: 500,
  });
  }


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


  // Group nearby live users into simple clusters
  const liveGroups = useMemo(
    () => groupLiveUsers(liveUsers, LIVE_GROUP_RADIUS_M),
    [liveUsers]
  );



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


// Build upgraded posts into stack same-spot pins into "spots"
const upgradedPosts = useMemo(
  () => (upgradeIds || [])
    .map(uid => posts.find(p => String(p.id) === String(uid)))
    .filter(Boolean),
  [upgradeIds, posts]
);
const upgradedSpots = useMemo(
  () => buildSpotStacks(upgradedPosts),
  [upgradedPosts]
);

// Build petals per upgraded spot (screen-space offsets → nearby coords)
const flowerSpots = useMemo(() => {
  const z = cameraInfo?.zoom ?? 0;
  return upgradedSpots.map(spot => ({
    ...spot,
    petals: buildPetalsForSpot(spot, z), // [] if not eligible by zoom/count
  }));
}, [upgradedSpots, cameraInfo?.zoom]);

// Calculate collisions before rendering
const liveCollisions = useMemo(
  () => detectCollisions(upgradedSpots, liveGroups, cameraInfo?.zoom ?? 14, 12),
  [upgradedSpots, liveGroups, cameraInfo?.zoom]
);

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
          .select('id, text, lat, lng, created_at, expires_at, user_id, category, photo_url, profiles:user_id(avatar_url, username)')
          .gt('created_at', fourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(400);

        if (error) {
          console.error('Error fetching posts:', error);
        } else {
          const withAvatars = (data || []).map(p => ({
            ...p,
            avatar_url: p?.profiles?.avatar_url ?? null,
            username: p?.profiles?.username ?? null,
          }));
          setPosts(withAvatars);
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
            async payload => {
              try {
                const post = payload.new;
                if (!post?.id || !Number.isFinite(post?.lat) || !Number.isFinite(post?.lng)) return;

                // Attach avatar_url by looking up the user's profile once
                try {
                  const av = await fetchAvatarForUser(post?.user_id);
                  if (av) post.avatar_url = av;
                } catch {}

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



  function shouldSendHeartbeat({ lat, lng }) {
  const now = Date.now();
  const since = now - (lastHeartbeatAtRef.current || 0);

  // time gate: at least once per minute
  const timeGate = since >= HEARTBEAT_MIN_INTERVAL;

  // distance gate: > 20m vs last heartbeat coord (coarse/jitter AFTER we compute distance vs lastDeviceCoord)
  let distGate = false;
  if (lastHeartbeatCoordRef.current) {
    const d = distanceInMeters(
      lastHeartbeatCoordRef.current.lat,
      lastHeartbeatCoordRef.current.lng,
      lat,
      lng
    );
    distGate = d >= MIN_MOVE_METERS;
  } else {
    // first time, allow
    distGate = true;
  }

  return timeGate || distGate;
}

  async function maybeSendHeartbeat() {
  try {
    if (!shareLive) return;

    // prefer the watcher’s latest reading; fallback to a one-shot
    let lat = lastDeviceCoordRef.current?.latitude ?? userLoc?.latitude;
    let lng = lastDeviceCoordRef.current?.longitude ?? userLoc?.longitude;

    if (lat == null || lng == null) {
      try {
        const { coords } = await Location.getCurrentPositionAsync({});
        lat = coords.latitude; lng = coords.longitude;
      } catch { return; }
    }

    if (!shouldSendHeartbeat({ lat, lng })) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // privacy: coarse grid + user-stable jitter
    const coarse = coarseAndJitter(lat, lng, user.id);

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
      return;
    }

    // update last-sent markers
    lastHeartbeatAtRef.current = Date.now();
    lastHeartbeatCoordRef.current = { lat: coarse.lat, lng: coarse.lng };
  } catch (e) {
    console.error('[LiveLoc] Heartbeat error:', e);
  }
  }



  // [LIVELOC] READ: poll nearby users every 20s (last <= 60min; hide > 45min in UI)
  async function pollNearby() {
    try {
      // gradually back off when nothing changes; reset when changes arrive
      let beforeHash = JSON.stringify(liveUsers.map(u => [u.user_id, u.lat, u.lng])); 

      // simple bounding box around current user to trim payload
      const center = userLoc ?? { latitude: 30.2849, longitude: -97.7341 };
      const latPad = 0.2; // ~22km; tune for campus size
      const lngPad = 0.2;

      const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last 60 min

      const { data, error } = await supabase
      .from('live_locations')
      .select(`user_id, lat, lng, last_seen, profiles:user_id(avatar_url, username)`)
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
        const withProfiles = data.map(u => ({
          ...u,
          avatar_url: u.profiles?.avatar_url ?? null,
          username:   u.profiles?.username ?? null,
        }));
        setLiveUsers(withProfiles);


        const afterHash = JSON.stringify((data || []).map(u => [u.user_id, u.lat, u.lng]));
        if (afterHash !== beforeHash) {
          // changes seen -> stay snappy
          if (pollIntervalMs !== 20_000) setPollIntervalMs(20_000);
        } else {
          // no changes -> back off gently up to 60s
          if (pollIntervalMs < 60_000) setPollIntervalMs(pollIntervalMs * 2);
        }
      }
    } catch (e) {
      console.error('[LiveLoc] Poll error:', e);
    }
  }

    // polling loop with simple backoff
  useEffect(() => {
    // clear any running timers
    if (pollRef.current) clearInterval(pollRef.current);

    if (!pollingActive) return;
    // do an immediate poll for snappy UI
    pollNearby();

    pollRef.current = setInterval(pollNearby, pollIntervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollingActive, pollIntervalMs]);

  // on app resume: instant poll + heartbeat
  useEffect(() => {
    const onAppStateChange = (state) => {
      const wasActive = appState.current === 'active';
      appState.current = state;

      if (state === 'active') {
        // instant “catch up”
        pollNearby();
        maybeSendHeartbeat();
        // reset poll interval after resume
        setPollIntervalMs(20_000);
      } else if (wasActive && state.match(/inactive|background/)) {
        // nothing to do; loops are already cleaned by other effect
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

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

      // If a photo was selected, upload it and get a public URL
      let photoUrl = null;
      if (photoUri) {
        photoUrl = await uploadPhotoAsync(photoUri, userId);
      }

      const { data, error } = await supabase
      .from('posts')
      .insert([{
        text,
        lat,
        lng,
        category,             // <- from composer
        photo_url: photoUrl
        // expires_at will auto-default to +4h
      }])
      .select(`id, text, lat, lng, created_at, expires_at, user_id, category, photo_url, profiles:user_id(avatar_url, username)`);

      if (error) {
        console.error('Error posting:', error);
        alert('Failed to post. Please try again.');
        return;
      }

      if (data && data[0]) {
        lastPostTime.current = now;

        const inserted = {...data[0],
        avatar_url: data[0]?.profiles?.avatar_url ?? null,
        username:   data[0]?.profiles?.username ?? null,
      };


        setPosts(prev => [inserted, ...prev]);
        setDraftText('');

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
        iconAllowOverlap: true,
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

      {/* Upgrade layer: singles → PinMarker, stacks → SpotMarker with petals */}
      {flowerSpots.map((spot, idx) => {
      const { lng, lat, posts: bucket, hero, count } = spot;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

      const tint = categoryTint(hero.category || 'event');
      const minsLeft = minutesLeftForPost(hero, 240);
      const totalMins = totalMinutesForPost(hero, 240);

      // Selected if any post in the bucket is selected
      const isSelected = !!(selectedPost && bucket.some(p => String(p.id) === String(selectedPost.id)));

      const onPress = () => {
        console.log('[Spot Tap] count:', count, 'bucket:', bucket.length);
        if (count === 1) {
          if (selectedPost && String(selectedPost.id) === String(hero.id)) {
            setSheetOpen(true);
          } else {
            setSelectedPost(hero);
            setSheetOpen(false);
          }
        } else {
          setSelectedCluster(bucket);
          setSheetOpen(false);
        }
      };

      // Get petals (exclude hero)
      const petals = count > 1
        ? bucket.filter(p => String(p.id) !== String(hero.id)).slice(0, 5)
        : [];
      const petalOffsets = petals.length > 0 ? getPetalOffsets(petals.length) : [];

      // NEW: scale slightly just above upgrade threshold
      const zoom = cameraInfo?.zoom ?? 14;
      const scaleDown = (zoom >= UPGRADE_ZOOM && zoom < UPGRADE_ZOOM + 0.5) ? POST_SCALE_NEAR_THRESHOLD : 1;

      return (
        <MapboxGL.MarkerView
          key={`spot-${idx}-${hero.id}`}
          id={`spot-${idx}-${hero.id}`}
          coordinate={[lng, lat]}
          anchor={{ x: 0.5, y: 1 }}
          allowOverlap={true}
        >
          {/* Container for flower layout */}
          <View
            style={{
              position: 'relative',
              alignItems: 'center',
              zIndex: POST_ZINDEX,                // NEW: ensure posts below live rings
              transform: [{ scale: scaleDown }],  // NEW: subtle shrink near threshold
            }}
          >
            {/* Render petals behind hero (do not capture touches) */}
            {petals.map((petal, pIdx) => {
              const offset = petalOffsets[pIdx] || { x: 0, y: 0 };
              return (
                <View
                  key={`petal-${petal.id}`}
                  pointerEvents="none"             // NEW: prevent petals from stealing taps
                  style={{ position: 'absolute' }}
                >
                  <PetalMarker
                    size={30}
                    avatarUrl={petal.avatar_url}
                    photoUrl={petal.photo_url}
                    tint={tint}
                    offsetX={offset.x}
                    offsetY={offset.y}
                  />
                </View>
              );
            })}

            {/* Hero pin (on top, tappable) */}
            {count === 1 ? (
              <PinMarker
                post={hero}
                tint={tint}
                avatarUrl={hero.avatar_url}
                text={hero.text}
                photoUrl={hero.photo_url}
                minutesLeft={minsLeft}
                totalMinutes={totalMins}
                selected={isSelected}
                onPress={onPress}
                createdAt={hero.created_at}
              />
            ) : (
              <SpotMarker
                tint={tint}
                avatarUrl={hero.avatar_url}
                minutesLeft={minsLeft}
                totalMinutes={totalMins}
                selected={isSelected}
                count={count}
                onPress={onPress}
              />
            )}
          </View>
        </MapboxGL.MarkerView>
      );
    })}

        {/* [LIVELOC] render grouped live users with petals + +N badge (collision-aware) */}
        {(liveGroups || []).map((g, idx) => {
          const members = g.members || [];
          if (!members.length) return null;

          // Centroid using animated positions
          const coords = members.map(u => {
            const pos = animatedPositions.get(u.user_id);
            return {
              lat: pos?.lat ?? u.lat,
              lng: pos?.lng ?? u.lng,
              last_seen: u.last_seen,
              avatar_url: u.avatar_url,
              user_id: u.user_id,
              username: u.username,
            };
          });
          const lat = coords.reduce((s, p) => s + p.lat, 0) / coords.length;
          const lng = coords.reduce((s, p) => s + p.lng, 0) / coords.length;

          // Age bucket → ring color
          const youngest = youngestMinutes(coords);
          const { bucket } = classifyAge(youngest);
          if (bucket === 'hide') return null;
          const ringColor = RING_BY_BUCKET[bucket] || '#9ca3af';

          const count = coords.length;
          const zoom = cameraInfo?.zoom ?? 0;
          const countOnly = zoom < LIVE_COUNT_ONLY_ZOOM;

          // 🔸 Collision offset (only when not count-only)
          const col = liveCollisions.get(idx);
          let finalLng = lng;
          let finalLat = lat;
          if (col && !countOnly) {
            const [olng, olat] = offsetCoordByPixels(
              { lng, lat },
              col.offsetX,
              col.offsetY,
              zoom
            );
            finalLng = olng;
            finalLat = olat;
          }

          if (countOnly) {
            return (
              <MapboxGL.MarkerView
                key={`livegrp-${idx}`}
                id={`livegrp-${idx}`}
                coordinate={[lng, lat]}
                anchor={{ x: 0.5, y: 0.5 }}
                allowOverlap={true}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center', zIndex: LIVE_ZINDEX }}>
                  <LiveClusterMarker ringColor={ringColor} count={count} size={36} />
                </View>
              </MapboxGL.MarkerView>
            );
          }

          // Zoomed-in “flower”
          const sorted = sortByRecency(coords);
          const hero = sorted[0];
          const petals = sorted.slice(1, LIVE_PETAL_MAX + 1);
          const extra = Math.max(0, count - (1 + petals.length));
          const petalOffsets = getPetalOffsets(petals.length);

          const onPressCluster = () => {
            setLiveClusterSheet({ lat, lng, members: coords });
          };

          return (
            <MapboxGL.MarkerView
              key={`livegrp-${idx}`}
              id={`livegrp-${idx}`}
              coordinate={[finalLng, finalLat]}  // ⬅️ use offset coords
              allowOverlap={true}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', zIndex: LIVE_ZINDEX }}>
                {/* Petals must not capture touches */}
                {petals.map((m, i) => {
                  const off = petalOffsets[i] || { x: 0, y: 0 };
                  return (
                    <View
                      key={`petal-${m.user_id}`}
                      style={{ position: 'absolute', transform: [{ translateX: off.x }, { translateY: off.y }] }}
                      pointerEvents="none"
                    >
                      <LiveRingMarker size={28} ringColor={ringColor} avatarUrl={m.avatar_url} />
                    </View>
                  );
                })}

                {/* Hero + +N badge */}
                <View style={{ alignItems: 'center' }}>
                  <View /* tap target */>
                    <View style={{ alignItems: 'center' }}>
                      <LiveRingMarker size={34} ringColor={ringColor} avatarUrl={hero?.avatar_url} />
                      <View
                        style={{ position: 'absolute', top: -8, bottom: -8, left: -8, right: -8 }}
                        onStartShouldSetResponder={() => true}
                        onResponderRelease={onPressCluster}
                      />
                      {extra > 0 && (
                        <View
                          style={{
                            position: 'absolute',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor: 'rgba(17,24,39,0.9)',
                            borderWidth: 1.5,
                            borderColor: 'white',
                          }}
                          pointerEvents="none"
                        >
                          <Text style={{ color: 'white', fontSize: 12, fontWeight: '800' }}>
                            {extra >= 99 ? '+99' : `+${extra}`}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
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
          // instant actions for responsiveness
          if (next) { maybeSendHeartbeat(); }
          if (pollingActive) { pollNearby(); }
        }}
        onFilterPress={() => { console.log('Filter pressed'); }}
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



       <SpotFeedSheet
  visible={!!selectedCluster}
  title="This spot"
  distanceLabel={distanceLabelForCluster(selectedCluster, userLoc)}
  posts={selectedCluster || []}
  onClose={() => setSelectedCluster(null)}
  onSelectPost={(p) => {
    setSelectedPost(p);        // open the post
    setSheetOpen(true);        // trigger PostSheet
    setSelectedCluster(null);  // close the spot sheet
  }}
  onViewOnMap={(p) => {
    if (p?.lng && p?.lat) recenterTo({ lng: p.lng, lat: p.lat, zoom: 17 });
  }}
/>

     <PostSheet
   post={sheetOpen ? selectedPost : null}
   onClose={() => { setSheetOpen(false); setSelectedPost(null); }}
   userId={userId}
   onRecenterMap={recenterTo}
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
        onPress={() => {
          setPollingActive((p) => {
            const next = !p;
            if (!p) pollNearby(); // turning ON → poll now for instant feedback
            return next;
          });
        }}
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

      {/* Live location sheet */}
      <LiveClusterSheet
        visible={!!liveClusterSheet}
        group={liveClusterSheet}
        onClose={() => setLiveClusterSheet(null)}
        onCenterOnUser={(u) => {
          if (u?.lng != null && u?.lat != null) {
            recenterTo({ lng: u.lng, lat: u.lat, zoom: 17 });
          }
        }}
      />

      {/* Primary FAB */}
      <FAB visible={!composerOpen} onPress={() => setComposerOpen(true)} />


        {/* Temporary test button */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 100,
          right: 16,
          backgroundColor: 'red',
          padding: 12,
          borderRadius: 8,
          zIndex: 9999,
        }}
        onPress={() => {
          console.log('Test button pressed - forcing sheet open');
          setSelectedCluster(posts.slice(0, 3)); // Use first 3 posts as test
        }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold' }}>Test Sheet</Text>
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