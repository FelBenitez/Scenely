// app/(tabs)/map.jsx
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const token =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_TOKEN;

console.log('Mapbox token prefix:', token?.slice(0, 3));
MapboxGL.setAccessToken(token || '');

export default function MapTab() {
  const cameraRef = useRef(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [userLoc, setUserLoc] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const { coords } = await Location.getCurrentPositionAsync({});
        setUserLoc({ latitude: coords.latitude, longitude: coords.longitude });
      }
    })();
  }, []);

  const submitPost = async () => {
    let lat = userLoc?.latitude;
    let lng = userLoc?.longitude;

    if (lat == null || lng == null) {
      try {
        const { coords } = await Location.getCurrentPositionAsync({});
        lat = coords.latitude;
        lng = coords.longitude;
      } catch (e) {
        lat = 30.2849;
        lng = -97.7341;
      }
    }

    const text = draftText.trim();
    if (!text) return;

    const newPost = {
      id: Date.now().toString(),
      text,
      lat: Number(lat),
      lng: Number(lng),
    };
    setPosts((prev) => [newPost, ...prev]);
    setDraftText('');
    setComposerOpen(false);

    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: 16,
      animationDuration: 500,
    });

    console.log('Posting at', { lat, lng }, 'text:', text);
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

        {posts.map((p) => (
          <MapboxGL.MarkerView
            key={p.id}
            id={p.id}
            coordinate={[p.lng, p.lat]}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.markerContainer}>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{p.text}</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          </MapboxGL.MarkerView>
        ))}
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


// // app/(tabs)/map.jsx
// import MapboxGL from '@rnmapbox/maps';
// import Constants from 'expo-constants';
// import * as Location from 'expo-location'; // gives GPS cross platform
// import { useEffect, useMemo, useRef, useState } from 'react';
// import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';


// const token =
//   process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
//   Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_TOKEN;

// console.log('Mapbox token prefix:', token?.slice(0, 3)); // should log "pk."
// MapboxGL.setAccessToken(token || '');

// export default function MapTab() {

//   const [styleLoaded, setStyleLoaded] = useState(false);
//   const [selectedId, setSelectedId] = useState(null);

//   const cameraRef = useRef(null);

//   const [composerOpen, setComposerOpen] = useState(false);
//   const [draftText, setDraftText] = useState('');
//   const [userLoc, setUserLoc] = useState(null);     // { latitude, longitude }
//   const [posts, setPosts] = useState([]);           // [{ id, text, lat, lng }]


//   const postsFC = useMemo(
//     () => ({
//       type: 'FeatureCollection',
//       features: posts.map(p => ({
//         type: 'Feature',
//         id: p.id,
//         properties: {},
//         geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
//       })),
//     }),
//     [posts]
//   );

//   useEffect(() => {
//     (async () => {
//       const { status } = await Location.requestForegroundPermissionsAsync();
//       if (status === 'granted') {
//         const { coords } = await Location.getCurrentPositionAsync({});
//         setUserLoc({ latitude: coords.latitude, longitude: coords.longitude });
//       }
//     })();
//   }, []);

//   const getCameraCenter = async () => {
//     if (cameraRef.current?.getCenter) {
//       const center = await cameraRef.current.getCenter(); // [lng, lat]
//       return { lat: center[1], lng: center[0] };
//     }
//     return userLoc
//       ? { lat: userLoc.latitude, lng: userLoc.longitude }
//       : { lat: 30.2849, lng: -97.7341 };
//   };

//   const submitPost = async () => {

//   // prefer live userLoc; if missing, fetch once
//   let lat = userLoc?.latitude;
//   let lng = userLoc?.longitude;

//   if (lat == null || lng == null) {
//     try {
//       const { coords } = await Location.getCurrentPositionAsync({});
//       lat = coords.latitude;
//       lng = coords.longitude;
//     } catch (e) {
//       // final fallback: UT Austin
//       lat = 30.2849; lng = -97.7341;
//     }
//   }

//   const text = draftText.trim();
//   if (!text) return;

//   const newPost = { id: Date.now().toString(), text, lat: Number(lat), lng: Number(lng)};
//   setPosts(prev => [newPost, ...prev]);
//   setDraftText('');
//   setComposerOpen(false);
//   setSelectedId(newPost.id); // autoshow bubble for new post

//   // fly camera to the new post so you see it immediately
//   cameraRef.current?.setCamera({
//     centerCoordinate: [lng, lat],
//     zoomLevel: 16,
//     animationDuration: 500,
//   });

//   console.log('Posting at', { lat, lng }, 'text:', text);
// };


//   return (



//     <View style={styles.container}>
//       <MapboxGL.MapView
//       style={StyleSheet.absoluteFillObject}
//       styleURL={MapboxGL.StyleURL.Street}
//       onDidFinishLoadingMap={() => console.log('✅ Map finished loading')}
//       onDidFinishLoadingStyle={() => setStyleLoaded(true)}
      
//     >
//       <MapboxGL.Camera
//         ref={cameraRef}
//         centerCoordinate={[-97.7341, 30.2849]}
//         zoomLevel={14}
//       />

//       {/* shows the blue dot for your current GPS location */}
//       <MapboxGL.UserLocation
//         visible={true}
//         onUpdate={(e) => {
//           if (e?.coords) {
//             setUserLoc({ latitude: e.coords.latitude, longitude: e.coords.longitude });
//           }
//         }}
//       />


//       {posts.map(p => (
//       <MapboxGL.PointAnnotation
//       key={p.id}
//       id={p.id}
//       coordinate={[p.lng, p.lat]}
//       anchor={{ x: 0.5, y: 1.0 }}
//     >
//       {/* single root view; give it a layout box */}
//       <View collapsable={false} style={{ alignItems: 'center' }}>
//         {selectedId === p.id ? (
//           <View style={styles.bubbleWrap}>
//             <View style={styles.bubble}>
//               <Text style={styles.bubbleText}>{String(p.text)}</Text>
//             </View>
//             <View style={styles.bubbleArrow} />
//           </View>
//         ) : (
//           <View style={styles.pin} />
//         )}
//       </View>
//     </MapboxGL.PointAnnotation>
//     ))}


      

//       {styleLoaded && (
//   <>

    
//   </>
// )}
//     </MapboxGL.MapView>



//       <Modal transparent visible={composerOpen} animationType="slide" onRequestClose={() => setComposerOpen(false)}>
//       <View style={styles.modalBackdrop}>
//         <View style={styles.sheet}>
//           <Text style={styles.sheetTitle}>Create post</Text>
//           <Text style={styles.sheetHint}>Pin drops at the map center. Drag map to adjust.</Text>
//           <TextInput
//             value={draftText}
//             onChangeText={setDraftText}
//             placeholder="What’s up?"
//             maxLength={120}
//             style={styles.input}
//           />
//           <View style={styles.row}>
//             <TouchableOpacity style={styles.secondaryBtn} onPress={() => setComposerOpen(false)}>
//               <Text>Cancel</Text>
//             </TouchableOpacity>
//             <TouchableOpacity style={styles.primaryBtn} onPress={submitPost}>
//               <Text style={{ color: 'white', fontWeight: '600' }}>Post</Text>
//             </TouchableOpacity>
//           </View>
//         </View>
//       </View>
//     </Modal>




//       {/* Button overlay */}
//       <TouchableOpacity style={styles.fab} onPress={() => setComposerOpen(true)}>
//         <Text style={styles.fabText}>Post</Text>
//       </TouchableOpacity>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1 },
//       fab: {
//       position: 'absolute',
//       bottom: 24,
//       right: 16,
//       width: 64,
//       height: 64,
//       borderRadius: 32,
//       backgroundColor: '#1976D2', // blue
//       alignItems: 'center',
//       justifyContent: 'center',
//       // shadow
//       shadowColor: '#000',
//       shadowOpacity: 0.25,
//       shadowRadius: 8,
//       shadowOffset: { width: 0, height: 4 },
//       elevation: 6, // Android shadow
//     },
//     fabText: {
//       color: 'white',
//       fontWeight: '600',
//     },


//     pin: {
//     width: 18, height: 18, borderRadius: 9,
//     backgroundColor: '#1976D2',
//     alignItems: 'center', justifyContent: 'center',
//     borderWidth: 2, borderColor: 'white',
//   },
//     pinText: { color: 'white', fontSize: 12, marginTop: -1 },

//     modalBackdrop: {
//       flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end',
//     },
//     sheet: {
//       backgroundColor: 'white', padding: 16,
//       borderTopLeftRadius: 16, borderTopRightRadius: 16,
//     },
//     sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
//     sheetHint: { color: '#666', marginBottom: 12 },
//     input: {
//       borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginBottom: 12,
//     },
//     row: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
//     secondaryBtn: { paddingVertical: 10, paddingHorizontal: 14 },
//     primaryBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#1976D2', borderRadius: 10 },

//     // To move bubble
//     bubbleWrap: { alignItems: 'center', transform: [{ translateY: -6 }]},
  
//     bubble: {
//   minWidth: 80,         
//   minHeight: 32,       
//   maxWidth: 240,
//   paddingVertical: 8,
//   paddingHorizontal: 10,
//   backgroundColor: 'white',
//   borderRadius: 12,
//   borderWidth: 1,
//   borderColor: '#ddd',
//   shadowColor: '#000',
//   shadowOpacity: 0.15,
//   shadowRadius: 6,
//   shadowOffset: { width: 0, height: 3 },
//   elevation: 3,
// },
// bubbleText: { color: '#111', fontSize: 14 },
// bubbleArrow: {
//   width: 0, height: 0, marginTop: -1,
//   borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 10,
//   borderLeftColor: 'transparent', borderRightColor: 'transparent',
//   borderTopColor: 'white',
// },

    


// });