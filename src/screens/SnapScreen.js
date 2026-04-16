import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path, Line, Polyline, Rect, Circle } from 'react-native-svg';
import { palette } from '../constants/tokens';
import { useAuth } from '../context/AuthContext';
import AuthGate from '../components/AuthGate';
import TabScreenFade from '../components/TabScreenFade';
import { useOnboarding, ONBOARDING_STEPS } from '../context/OnboardingContext';
import OnboardingOverlay from '../components/OnboardingOverlay';

// ─── Icons ───────────────────────────────────────────────────────────────────

function XIcon({ size = 16, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

function GalleryIcon({ size = 22, color = 'rgba(255,255,255,0.9)' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

// ─── SnapScreen ───────────────────────────────────────────────────────────────

export default function SnapScreen({ navigation, route }) {
  const { user } = useAuth();
  const { isStepActive, nextStep, prevStep, finishOnboarding } = useOnboarding();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState(false);
  const cameraRef = useRef(null);
  const mediaPermGranted = useRef(false);

  // Optional: product passed from ProductDetailScreen for single-product visualize flow.
  // When present, the captured photo + product are forwarded to HomeScreen which runs
  // the single-product generation pipeline instead of the full room redesign.
  const singleProduct = route?.params?.product ?? null;

  // ── Auth gate ──
  if (!user) {
    return (
      <AuthGate
        title="Design with AI"
        subtitle="Take a photo of your room and generate AI-powered wishes with shoppable products."
        navigation={navigation}
      />
    );
  }

  // Simple in-flight guard so rapid double-taps on the shutter / library
  // button don't queue two navigations.
  const tapInFlight = useRef(false);

  const handleCapture = async () => {
    if (!cameraRef.current || tapInFlight.current) return;
    tapInFlight.current = true;
    try {
      // base64 omitted — upload helper reads file on-demand, keeps capture snappy
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) {
        Alert.alert('Capture Failed', 'We couldn\'t capture that photo. Please try again.');
        return;
      }
      // Explicitly pass dimensions so the AI generation pipeline can derive
      // the correct aspect ratio for both portrait and landscape photos.
      navigation.navigate('Home', {
        capturedPhoto: { uri: photo.uri, base64: null, width: photo.width, height: photo.height },
        singleProduct,  // null for normal flow, product object for single-product visualize
      });
    } catch (err) {
      console.warn('[Snap] capture failed:', err?.message || err);
      Alert.alert('Capture Failed', 'We couldn\'t take that photo. Please try again.');
    } finally {
      // release the guard after a brief delay so the next tap has to be intentional
      setTimeout(() => { tapInFlight.current = false; }, 800);
    }
  };

  const handlePickFromLibrary = async () => {
    if (tapInFlight.current) return;
    tapInFlight.current = true;
    try {
      if (!mediaPermGranted.current) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Photo Access Needed',
            'Allow HomeGenie to access your photos to pick a room image.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings?.() },
            ]
          );
          return;
        }
        mediaPermGranted.current = true;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        Alert.alert('Could Not Load Photo', 'Please try picking a different photo.');
        return;
      }
      navigation.navigate('Home', {
        capturedPhoto: { uri: asset.uri, base64: null, width: asset.width, height: asset.height },
        singleProduct,  // null for normal flow, product object for single-product visualize
      });
    } catch (err) {
      console.warn('[Snap] library pick failed:', err?.message || err);
      Alert.alert('Photo Unavailable', 'We couldn\'t load that photo. Please try again.');
    } finally {
      setTimeout(() => { tapInFlight.current = false; }, 800);
    }
  };

  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 32, fontFamily: 'Geist_400Regular' }}>
          Camera access is needed to photograph your room for AI design.
        </Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={{ color: '#fff', fontWeight: '700', fontFamily: 'Geist_700Bold' }}>Enable Camera</Text>
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

        {/* Shutter + gallery pick */}
        <View style={s.bottomBar}>
          <TouchableOpacity style={s.galleryBtn} onPress={handlePickFromLibrary} activeOpacity={0.7}>
            <GalleryIcon />
          </TouchableOpacity>

          <TouchableOpacity style={s.shutter} onPress={handleCapture} activeOpacity={0.8}>
            <View style={s.shutterInner} />
          </TouchableOpacity>

          <View style={{ width: 50 }} />
        </View>
      </View>

      {/* Onboarding Step 2 tooltip */}
      {isStepActive('camera') && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', zIndex: 1000 }}>
          <OnboardingOverlay
            visible
            step={ONBOARDING_STEPS.CAMERA}
            onNext={() => {
              nextStep();
              // Auto-navigate: Explore → first product → PDP for step 3
              navigation.navigate('Main', { screen: 'Explore' });
              setTimeout(() => {
                // Navigate to first product in catalog for the genie lamp tutorial
                const CATALOG = require('../data/productCatalog').PRODUCT_CATALOG;
                const firstProduct = CATALOG[0];
                if (firstProduct) {
                  const navProduct = { ...firstProduct, price: firstProduct.priceDisplay || `$${firstProduct.price}`, priceValue: firstProduct.price, source: firstProduct.source };
                  navigation.navigate('ProductDetail', { product: navProduct });
                }
              }, 600);
            }}
            onBack={() => {
              prevStep();
              navigation.navigate('Main', { screen: 'Home' });
            }}
            onSkip={finishOnboarding}
            tooltipPosition="below"
            style={{ position: 'relative', marginHorizontal: 16 }}
          />
        </View>
      )}
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
    borderRadius: 3,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 52,
    paddingHorizontal: 32,
  },
  shutter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#67ACE9',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  galleryBtn: {
    width: 50, height: 50, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
});
