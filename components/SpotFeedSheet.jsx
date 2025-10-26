// components/SpotFeedSheet.jsx
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Animated, Dimensions, Pressable, Modal } from 'react-native';
import PostCard from './PostCard';
import { deDupeSimilar, rankNew, rankTop } from '../utils/ranking';
import { Feather } from '@expo/vector-icons';

const SCREEN_H = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_H * 0.85;

// Sheet snaps
const SNAP_EXPANDED = 0;
const SNAP_MID = SHEET_HEIGHT * 0.47;
const SNAP_CLOSED = SHEET_HEIGHT;

// helper thresholds to avoid “almost zero” jitter from spring rounding
const NEAR = (a, b, tol = 6) => Math.abs(a - b) <= tol;

export default function SpotFeedSheet({
  visible,
  title = 'This spot',
  distanceLabel = '',
  posts = [],
  onClose,
  onSelectPost,
  onViewOnMap,
}) {
  const [tab, setTab] = useState('Top');

  const translateY = useRef(new Animated.Value(SNAP_CLOSED)).current;

  // ===== state that drives interaction =====
  const [isExpanded, setIsExpanded] = useState(false); // fully expanded?
  const flatListRef = useRef(null);
  const lastSnapRef = useRef(SNAP_CLOSED);

  // Backdrop
  const backdropOpacity = translateY.interpolate({
    inputRange: [SNAP_EXPANDED, SNAP_CLOSED],
    outputRange: [0.6, 0],
    extrapolate: 'clamp',
  });

  // Track expansion once (listener attached once)
  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      const nowExpanded = NEAR(value, SNAP_EXPANDED, 4);
      if (nowExpanded !== isExpanded) setIsExpanded(nowExpanded);
    });
    return () => translateY.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open / close
  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: SNAP_MID,
        useNativeDriver: true,
        damping: 25,
        stiffness: 300,
      }).start(() => {
        lastSnapRef.current = SNAP_MID;
      });
    } else {
      Animated.timing(translateY, {
        toValue: SNAP_CLOSED,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        lastSnapRef.current = SNAP_CLOSED;
      });
    }
  }, [visible, translateY]);

  const closeSheet = () => {
    Animated.timing(translateY, {
      toValue: SNAP_CLOSED,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      lastSnapRef.current = SNAP_CLOSED;
      onClose?.();
    });
  };

  const expandSheet = () => {
    Animated.spring(translateY, {
      toValue: SNAP_EXPANDED,
      useNativeDriver: true,
      damping: 25,
      stiffness: 300,
    }).start(() => {
      lastSnapRef.current = SNAP_EXPANDED;
    });
  };

  const snapToMid = () => {
    Animated.spring(translateY, {
      toValue: SNAP_MID,
      useNativeDriver: true,
      damping: 25,
      stiffness: 300,
    }).start(() => {
      lastSnapRef.current = SNAP_MID;
    });
  };

  // ===== manual pan (header + “anywhere when half-open”) =====
  const panStartY = useRef(0);
  const touchStartY = useRef(0);
  const lastTouchY = useRef(0);
  const lastTouchTime = useRef(0);

  const handleTouchStart = (pageY) => {
    panStartY.current = (translateY).__getValue();
    touchStartY.current = pageY;
    lastTouchY.current = pageY;
    lastTouchTime.current = Date.now();
  };

  const handleTouchMove = (pageY) => {
    const dy = pageY - touchStartY.current;
    const newY = Math.max(SNAP_EXPANDED, Math.min(SNAP_CLOSED, panStartY.current + dy));
    translateY.setValue(newY);
    lastTouchY.current = pageY;
    lastTouchTime.current = Date.now();
  };

  const handleTouchEnd = (pageY) => {
    const currentY = translateY.__getValue();
    const dy = pageY - touchStartY.current;

    const timeDiff = Date.now() - lastTouchTime.current;
    const yDiff = pageY - lastTouchY.current;
    const velocity = timeDiff > 0 ? yDiff / timeDiff : 0;

    let snap = SNAP_MID;

    if (Math.abs(velocity) > 0.5) {
      snap = velocity > 0 ? (currentY < SNAP_MID ? SNAP_MID : SNAP_CLOSED) : SNAP_EXPANDED;
    } else if (Math.abs(dy) > 50) {
      snap = dy > 0 ? (currentY < SNAP_MID ? SNAP_MID : SNAP_CLOSED) : SNAP_EXPANDED;
    } else {
      // nearest
      const candidates = [SNAP_EXPANDED, SNAP_MID, SNAP_CLOSED];
      snap = candidates.reduce((a, b) => (Math.abs(currentY - a) < Math.abs(currentY - b) ? a : b));
    }

    Animated.spring(translateY, {
      toValue: snap,
      useNativeDriver: true,
      damping: 25,
      stiffness: 300,
    }).start(() => {
      lastSnapRef.current = snap;
      if (snap === SNAP_CLOSED) onClose?.();
      // prevent “dead scroll” by resetting list when leaving expanded
      if (snap !== SNAP_EXPANDED && flatListRef.current) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: false });
      }
    });
  };

  // ===== data =====
  const dataset = useMemo(() => {
    const base = tab === 'New' ? rankNew(posts) : rankTop(posts);
    return deDupeSimilar(base);
  }, [posts, tab]);

  const renderTile = ({ item }) => (
    <PostCard
      post={item}
      variant="tile"
      onPress={onSelectPost}
      onViewMap={onViewOnMap}
    />
  );

  if (!visible) return null;

  const allowDragAnywhere = !isExpanded; // half-open or closing → drag from anywhere
  const listTakesTouches = isExpanded;   // fully expanded → list scrolls; sheet only draggable from header

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeSheet}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
        />
      </Pressable>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheetContainer, { transform: [{ translateY }] }]}
      >
        <View style={styles.sheet}>

          {/* ===== DRAGGABLE HEADER (always) ===== */}
          <View
            style={styles.headerSection}
            onStartShouldSetResponder={() => true}
            onResponderGrant={(e) => handleTouchStart(e.nativeEvent.pageY)}
            onResponderMove={(e) => handleTouchMove(e.nativeEvent.pageY)}
            onResponderRelease={(e) => handleTouchEnd(e.nativeEvent.pageY)}
          >
            {/* Grabber + Close */}
            <View style={styles.grabberRow}>
              <View style={styles.grabber} />
              <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{title} · {posts.length} posts</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="map-pin" size={13} color="#6B7280" />
                <Text style={styles.sub}>{distanceLabel || 'Nearby'}</Text>
              </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              {['Top', 'New'].map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tab, tab === t && styles.tabActive]}
                >
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ===== CONTENT: drag anywhere when half-open; scroll only when expanded ===== */}
          <View
            style={styles.contentSection}
            pointerEvents={allowDragAnywhere ? 'auto' : 'box-none'}
            onStartShouldSetResponder={() => allowDragAnywhere}
            onResponderGrant={(e) => allowDragAnywhere && handleTouchStart(e.nativeEvent.pageY)}
            onResponderMove={(e) => allowDragAnywhere && handleTouchMove(e.nativeEvent.pageY)}
            onResponderRelease={(e) => allowDragAnywhere && handleTouchEnd(e.nativeEvent.pageY)}
          >
            <FlatList
              ref={flatListRef}
              data={dataset}
              keyExtractor={(item) => String(item.id)}
              numColumns={2}
              contentContainerStyle={{ paddingBottom: 28, paddingHorizontal: 8 }}
              renderItem={renderTile}
              showsVerticalScrollIndicator={false}
              bounces
              // 👇 these two lines prevent the “dead scroll” case
              scrollEnabled={listTakesTouches}
              pointerEvents={listTakesTouches ? 'auto' : 'none'}
              // if user tries to scroll while half-open, just expand
              onTouchStart={() => {
                if (!isExpanded) expandSheet();
              }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No posts at this spot</Text>
                </View>
              }
            />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
  sheetContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT, alignItems: 'center',
  },
  sheet: {
    flex: 1, width: '93%', backgroundColor: 'white',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 16, overflow: 'hidden',
  },

  headerSection: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 10,
  },
  contentSection: { flex: 1, backgroundColor: 'white' },

  grabberRow: {
    alignItems: 'center', paddingVertical: 12,
    flexDirection: 'row', justifyContent: 'center', position: 'relative',
  },
  grabber: { width: 54, height: 6, borderRadius: 3, backgroundColor: '#D1D5DB' },
  closeBtn: {
    position: 'absolute', right: 14, top: 8, width: 32, height: 32,
    borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 24, color: '#6B7280', fontWeight: '400', marginTop: -2 },

  header: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 13, color: '#6B7280' },

  tabs: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, paddingBottom: 12, gap: 6 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  tabActive: { backgroundColor: '#EEF2FF' },
  tabText: { color: '#6B7280', fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: '#3B82F6' },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontSize: 15 },
});