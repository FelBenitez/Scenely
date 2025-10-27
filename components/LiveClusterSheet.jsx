// components/LiveClusterSheet.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';

function fmtAgo(ts) {
  if (!ts) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ago`;
}

// Matches SpotFeedSheet dimensions/behavior
const SCREEN_H = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_H * 0.85;

const SNAP_EXPANDED = 0;
const SNAP_MID = SHEET_HEIGHT * 0.47;
const SNAP_CLOSED = SHEET_HEIGHT;

const NEAR = (a, b, tol = 6) => Math.abs(a - b) <= tol;

export default function LiveClusterSheet({
  visible,
  group, // { lat, lng, members: [...] }
  onClose,
  onCenterOnUser,  // (u) => void
}) {
  const members = group?.members || [];
  const dataset = useMemo(
    () =>
      members
        .slice()
        .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()),
    [members]
  );

  // Sheet animation state (copying SpotFeedSheet pattern)
  const translateY = useRef(new Animated.Value(SNAP_CLOSED)).current;
  const [isExpanded, setIsExpanded] = useState(false);
  const flatListRef = useRef(null);
  const lastSnapRef = useRef(SNAP_CLOSED);

  const backdropOpacity = translateY.interpolate({
    inputRange: [SNAP_EXPANDED, SNAP_CLOSED],
    outputRange: [0.6, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      const nowExpanded = NEAR(value, SNAP_EXPANDED, 4);
      if (nowExpanded !== isExpanded) setIsExpanded(nowExpanded);
    });
    return () => translateY.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Manual pan (header + anywhere when half-open)
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

    const timeDiff = Date.now() - lastTouchTime.current;
    const yDiff = pageY - lastTouchY.current;
    const velocity = timeDiff > 0 ? yDiff / timeDiff : 0;

    let snap = SNAP_MID;

    if (Math.abs(velocity) > 0.5) {
      snap = velocity > 0 ? (currentY < SNAP_MID ? SNAP_MID : SNAP_CLOSED) : SNAP_EXPANDED;
    } else if (Math.abs(dy) > 50) {
      snap = dy > 0 ? (currentY < SNAP_MID ? SNAP_MID : SNAP_CLOSED) : SNAP_EXPANDED;
    } else {
      const candidates = [SNAP_EXPANDED, SNAP_MID, SNAP_CLOSED];
      snap = candidates.reduce((a, b) =>
        Math.abs(currentY - a) < Math.abs(currentY - b) ? a : b
      );
    }

    Animated.spring(translateY, {
      toValue: snap,
      useNativeDriver: true,
      damping: 25,
      stiffness: 300,
    }).start(() => {
      lastSnapRef.current = snap;
      if (snap === SNAP_CLOSED) onClose?.();
      if (snap !== SNAP_EXPANDED && flatListRef.current) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: false });
      }
    });
  };

  if (!visible) return null;

  const allowDragAnywhere = !isExpanded; // drag anywhere when not fully expanded
  const listTakesTouches = isExpanded;   // list scroll only when expanded

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="none"
      onRequestClose={closeSheet}
      statusBarTranslucent
    >
      {/* Backdrop (tap to close) */}
      <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
        />
      </Pressable>

      {/* Sheet */}
      <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]}>
        <View style={styles.sheet}>
          {/* Draggable header */}
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

            {/* Title */}
            <View style={styles.header}>
              <Text style={styles.title}>People here · {members.length}</Text>
              {/* optional subline could go here if you add distance/updated labels */}
            </View>
          </View>

          {/* Content area (drag anywhere when half-open, scroll only when expanded) */}
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
              keyExtractor={(item) => String(item.user_id)}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => onCenterOnUser?.(item)}
                  style={styles.row}
                  activeOpacity={0.8}
                >
                  <Image
                    source={item.avatar_url ? { uri: item.avatar_url } : undefined}
                    style={styles.avatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.username || 'User'}</Text>
                    <Text style={styles.sub}>{fmtAgo(item.last_seen)}</Text>
                  </View>

                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
              bounces
              // match SpotFeedSheet scroll gating
              scrollEnabled={listTakesTouches}
              pointerEvents={listTakesTouches ? 'auto' : 'none'}
              onTouchStart={() => {
                if (!isExpanded) expandSheet();
              }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No one here (yet)</Text>
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

  headerSection: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 10,
  },
  contentSection: { flex: 1, backgroundColor: 'white' },

  grabberRow: {
    alignItems: 'center',
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
  },
  grabber: { width: 54, height: 6, borderRadius: 3, backgroundColor: '#D1D5DB' },
  closeBtn: {
    position: 'absolute',
    right: 14,
    top: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 24, color: '#6B7280', fontWeight: '400', marginTop: -2 },

  header: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 12,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', marginRight: 10 },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontSize: 15 },
});