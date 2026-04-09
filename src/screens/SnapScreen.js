import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { palette } from '../constants/tokens';
import { useAuth } from '../context/AuthContext';
import AuthGate from '../components/AuthGate';
import TabScreenFade from '../components/TabScreenFade';

// ─── Icons ───────────────────────────────────────────────────────────────────

function XIcon({ size = 16, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

function GalleryIcon({ size = 22, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

// ─── SnapScreen ───────────────────────────────────────────────────────────────

export default function SnapScreen({ navigation }) {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState(false);
  const cameraRef = useRef(null);

  // ── Auth gate ──
  if (!user) {
    return (
      <AuthGate
        title="Design with AI"
        subtitle="Snap your room and get AI-powered redesigns with shoppable products."
        navigation={navigation}
      />
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: true });
    navigation.navigate('Home', { capturedPhoto: photo });
  };

  const handlePickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    navigation.navigate('Home', {
      capturedPhoto: { uri: asset.uri, base64: asset.base64, width: asset.width, height: asset.height },
    });
  };

  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 32, fontFamily: 'Geist_400Regular' }}>
          Camera access is required to snap your room.
        </Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={{ color: '#fff', fontWeight: '700', fontFamily: 'Geist_700Bold' }}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TabScreenFade style={s.container}>
      <CameraView ref={cameraRef} style={s.camera} facing={facing} flash={flash ? 'on' : 'off'} />

      {/* Overlay controls — absolute positioned over camera */}
      <View style={s.overlay} pointerEvents="box-none">
        {/* Top controls */}
        <View style={s.topBar}>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={s.btn} onPress={() => setFlash(!flash)}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                {!flash && <Line x1={2} y1={2} x2={22} y2={22} />}
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M21 2v6h-6" /><Path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <Path d="M3 22v-6h6" /><Path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>

        {/* Corner guides */}
        <View style={s.guides}>
          <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 }]} />
          <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 }]} />
        </View>

        {/* Shutter + gallery */}
        <View style={s.bottomBar}>
          <TouchableOpacity style={s.galleryBtn} onPress={handlePickFromLibrary} activeOpacity={0.7}>
            <GalleryIcon size={26} />
            <Text style={s.galleryLabel}>Library</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.shutter} onPress={handleCapture} activeOpacity={0.8}>
            <View style={s.shutterInner} />
          </TouchableOpacity>

          <View style={{ width: 70 }} />
        </View>
      </View>
    </TabScreenFade>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  permBtn: {
    backgroundColor: palette.primaryBlue,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12,
  },
  guides: { flex: 1, margin: 40 },
  corner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 52,
    paddingHorizontal: 32,
  },
  galleryBtn: { width: 70, alignItems: 'center', gap: 4 },
  galleryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '500', fontFamily: 'Geist_500Medium'},
  shutter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
});
