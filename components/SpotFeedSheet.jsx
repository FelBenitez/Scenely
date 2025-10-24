// components/SpotFeedSheet.jsx
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Animated, Dimensions, Pressable, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import PostCard from './PostCard';
import { deDupeSimilar, rankNew, rankTop } from '../utils/ranking';

const SCREEN_H = Dimensions.get('window').height;

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
  
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;

  // Simple open/close animation
  useEffect(() => {
    if (visible) {
      console.log('[SpotFeedSheet] Opening with', posts.length, 'posts');
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SCREEN_H,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const dataset = useMemo(() => {
    const base = tab === 'New' ? rankNew(posts) : rankTop(posts);
    return deDupeSimilar(base);
  }, [posts, tab]);

  const keyExtractor = (item) => String(item.id);

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
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable 
        style={[StyleSheet.absoluteFill, styles.backdrop]} 
        onPress={onClose}
      />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            transform: [{ translateY }],
          }
        ]}
      >
        <View style={styles.sheet}>
          {/* Grabber */}
          <View style={styles.grabberRow}>
            <View style={styles.grabber} />
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title} · {posts.length} posts</Text>
            <Text style={styles.sub}>{distanceLabel || 'Nearby'}</Text>
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

          {/* Grid -> List */}
          <FlatList
            data={dataset}
            keyExtractor={keyExtractor}
            key={asList ? 'list' : 'grid'}
            numColumns={asList ? 1 : 2}
            contentContainerStyle={{ paddingBottom: 28, paddingHorizontal: 8 }}
            onScroll={(e) => {
              const y = e.nativeEvent.contentOffset.y;
              if (!asList && y > 120) setAsList(true);
              if (asList && y < 40) setAsList(false);
            }}
            renderItem={renderTile}
            showsVerticalScrollIndicator={false}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_H * 0.85,
  },
  sheet: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
  },
  grabber: {
    width: 54,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
  },
  closeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
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
    paddingTop: 8,
    paddingBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  sub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
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