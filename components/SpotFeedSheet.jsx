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
const SNAP_MID = SHEET_HEIGHT * 0.47;  // Opens here (mid-height)
const SNAP_CLOSED = SHEET_HEIGHT;

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
  const [asList, setAsList] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollY = useRef(0);
  
  const translateY = useRef(new Animated.Value(SNAP_CLOSED)).current;
  
  useEffect(() => {
    const subId = translateY.addListener(({ value }) => {
      // consider it expanded when very close to the expanded snap
      setIsExpanded(value <= SNAP_EXPANDED + 2);
    });
    return () => {
      if (subId) translateY.removeListener(subId);
    };
  }, [translateY]);

  const backdropOpacity = translateY.interpolate({
    inputRange: [SNAP_EXPANDED, SNAP_CLOSED],
    outputRange: [0.6, 0],
    extrapolate: 'clamp',
  });

  // Open/close animation
  useEffect(() => {
    if (visible) {
      console.log('[SpotFeedSheet] Opening with', posts.length, 'posts');
      Animated.spring(translateY, {
        toValue: SNAP_MID,
        useNativeDriver: true,
        damping: 25,
        stiffness: 300,
      }).start(() => setIsExpanded(false));
    } else {
      Animated.timing(translateY, {
        toValue: SNAP_CLOSED,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const closeSheet = () => {
    Animated.timing(translateY, {
      toValue: SNAP_CLOSED,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setIsExpanded(false);
      onClose?.();
    });
  };

  // Pan gesture handling
  const panStartY = useRef(0);
  const touchStartY = useRef(0);
  const lastTouchY = useRef(0);
  const lastTouchTime = useRef(0);

  const handleTouchStart = (pageY) => {
    panStartY.current = translateY.__getValue();
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
    
    // Calculate velocity (pixels per ms)
    const timeDiff = Date.now() - lastTouchTime.current;
    const yDiff = pageY - lastTouchY.current;
    const velocity = timeDiff > 0 ? yDiff / timeDiff : 0;
    
    // Determine snap target
    let snapTo = SNAP_MID;
    
    // Fast swipe detection (velocity in pixels per ms)
    if (Math.abs(velocity) > 0.5) {
      if (velocity > 0) {
        // Swiping down fast
        snapTo = currentY < SNAP_MID ? SNAP_MID : SNAP_CLOSED;
      } else {
        // Swiping up fast
        snapTo = SNAP_EXPANDED;
      }
    } else if (Math.abs(dy) > 50) {
      // Significant drag distance
      if (dy > 0) {
        snapTo = currentY < SNAP_MID ? SNAP_MID : SNAP_CLOSED;
      } else {
        snapTo = SNAP_EXPANDED;
      }
    } else {
      // Small movement - snap to nearest
      const distances = [
        { pos: SNAP_EXPANDED, dist: Math.abs(currentY - SNAP_EXPANDED) },
        { pos: SNAP_MID, dist: Math.abs(currentY - SNAP_MID) },
        { pos: SNAP_CLOSED, dist: Math.abs(currentY - SNAP_CLOSED) },
      ];
      
      distances.sort((a, b) => a.dist - b.dist);
      snapTo = distances[0].pos;
    }

    // Animate to snap position
    Animated.spring(translateY, {
      toValue: snapTo,
      useNativeDriver: true,
      damping: 25,
      stiffness: 300,
    }).start(() => {
      if (snapTo === SNAP_CLOSED) {
        onClose?.();
      }
    });
  };

  const dataset = useMemo(() => {
    const base = tab === 'New' ? rankNew(posts) : rankTop(posts);
    return deDupeSimilar(base);
  }, [posts, tab]);

  const renderTile = ({ item, index }) => (
    <PostCard
      post={item}
      variant={asList || index > 7 ? 'list' : 'tile'}
      onPress={onSelectPost}
      onViewMap={onViewOnMap}
    />
  );

  if (!visible) return null;

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
          style={[
            StyleSheet.absoluteFill, 
            styles.backdrop, 
            { opacity: backdropOpacity }
          ]} 
        />
      </Pressable>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            transform: [{ translateY }],
          }
        ]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={(e) => {
          // Drag from anywhere if not expanded; when expanded, only drag if list is at top
          const isScrollAtTop = scrollY.current <= 0;
          return !isExpanded || isScrollAtTop;
        }}
        onResponderGrant={(e) => {
          handleTouchStart(e.nativeEvent.pageY);
        }}
        onResponderMove={(e) => {
          const isScrollAtTop = scrollY.current <= 0;
          if (isScrollAtTop) {
            handleTouchMove(e.nativeEvent.pageY);
          }
        }}
        onResponderRelease={(e) => {
          handleTouchEnd(e.nativeEvent.pageY);
        }}
      >
        <View style={styles.sheet}>
          {/* Drag Handle Area - Always draggable */}
          <View 
            style={styles.handleArea}
            onStartShouldSetResponder={() => true}
            onResponderGrant={(e) => handleTouchStart(e.nativeEvent.pageY)}
            onResponderMove={(e) => handleTouchMove(e.nativeEvent.pageY)}
            onResponderRelease={(e) => handleTouchEnd(e.nativeEvent.pageY)}
          >
            <View style={styles.grabberRow}>
              <View style={styles.grabber} />
              <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
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

          {/* Grid → List */}
          <FlatList
            data={dataset}
            keyExtractor={(item) => String(item.id)}
            key={asList ? 'list' : 'grid'}
            numColumns={asList ? 1 : 2}
            contentContainerStyle={{ paddingBottom: 28, paddingHorizontal: 8 }}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
              const y = e.nativeEvent.contentOffset.y;
              if (!asList && y > 120) setAsList(true);
              if (asList && y < 40) setAsList(false);
            }}
            scrollEventThrottle={16}
            renderItem={renderTile}
            showsVerticalScrollIndicator={false}
            bounces={false}
            scrollEnabled={isExpanded}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No posts at this spot</Text>
              </View>
            }
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    alignItems: 'center',
  },
  sheet: {
    flex: 1,
    width: '93%',
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
    overflow: 'hidden',
  },
  handleArea: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabberRow: {
    alignItems: 'center',
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
  },
  grabber: {
    width: 54,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  closeBtn: {
    position: 'absolute',
    right: 14,
    top: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 24,
    color: '#6B7280',
    fontWeight: '400',
    marginTop: -2,
  },

  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  sub: {
    fontSize: 13,
    color: '#6B7280',
  },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#3B82F6',
  },

  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 15,
  },
});