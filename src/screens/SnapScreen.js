import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  Image, // for Image.getSize fallback when manipulateAsync doesn't return dims
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { lockPortrait, unlockAll } from '../utils/orientation';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Line, Polyline, Rect, Circle } from 'react-native-svg';
import { palette } from '../constants/tokens';
import { useAuth } from '../context/AuthContext';
import AuthGate from '../components/AuthGate';
import { warmupEdgeFunctions } from '../services/supabase';
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

// ─── Dimension resolver ───────────────────────────────────────────────────────
//
// Why this exists:
// `normalizeOrientation` returns the true post-rotation pixel dimensions by
// reading what `manipulateAsync` actually encoded. In the 99% case that's all
// we need. But if manipulateAsync itself failed (native module missing from a
// stale dev client, disk full, corrupt input), we get back `width: null,
// height: null` and need a fallback so `pickAspectRatio` downstream doesn't
// choke on NaN.
//
// `Image.getSize(uri)` is a synchronous RN built-in that reads pixel dims
// from the file/URL header without decoding the whole bitmap. It's slightly
// slower than using the manipulateAsync return value directly, but it never
// lies about orientation (reads the actual encoded bytes, not EXIF).
//
// The old SnapScreen code did the opposite: trusted `photo.exif?.Orientation`
// to compute a swap of `photo.width`/`photo.height`. On iOS 26 iPhone 14 Pro
// that field is often undefined for landscape captures, producing wrong dims
// → wrong aspect ratio bucket → flux-2-max rendering portrait for landscape
// sources. This resolver removes that EXIF dependency entirely.
function resolveDimensions(uri, manipulatedWidth, manipulatedHeight) {
  if (manipulatedWidth && manipulatedHeight) {
    return Promise.resolve({ width: manipulatedWidth, height: manipulatedHeight });
  }
  return new Promise(resolve => {
    Image.getSize(
      uri,
      (width, height) => {
        console.log('[Snap] resolveDimensions via Image.getSize', { width, height });
        resolve({ width, height });
      },
      err => {
        // Worst case: we can't read dims at all. Return nulls so the upstream
        // code falls back to its own Image.getSize block (HomeScreen has one)
        // or to aspect-ratio defaults. Never crash.
        console.warn('[Snap] resolveDimensions Image.getSize failed:',
          err?.message || err);
        resolve({ width: null, height: null });
      }
    );
  });
}

// ─── SnapScreen ───────────────────────────────────────────────────────────────

export default function SnapScreen({ navigation, route }) {
  const { user, loading: authLoading } = useAuth();
  const { isStepActive, nextStep, prevStep, finishOnboarding } = useOnboarding();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState(false);
  const cameraRef = useRef(null);
  const mediaPermGranted = useRef(false);

  // Allow landscape rotation while the camera is on screen so users can
  // hold their phone sideways for wide room shots. The rest of the app is
  // portrait-locked in App.js, so on blur we snap back to PORTRAIT_UP.
  // Both helpers are no-ops if the native module isn't linked into this
  // build (stale dev client) — the app still works, landscape just won't
  // rotate until the dev client is rebuilt.
  useFocusEffect(
    useCallback(() => {
      unlockAll();
      // Warm up the normalize-room-photo + composite-products edge functions
      // as soon as the user lands on the camera tab. Between framing the
      // shot and tapping the shutter, the Deno runtime will be hot — so the
      // real upload hits a warm runtime (~500ms round-trip) instead of a
      // cold start (5–15s, which triggered the silent raw-URL fallback
      // that shipped sideways bytes to flux-2-max in Build 24).
      warmupEdgeFunctions();
      return () => {
        lockPortrait();
      };
    }, [])
  );

  // Optional: product passed from ProductDetailScreen for single-product visualize flow.
  // When present, the captured photo + product are forwarded to HomeScreen which runs
  // the single-product generation pipeline instead of the full room redesign.
  const singleProduct = route?.params?.product ?? null;

  // ── Auth gate ──
  // While AuthContext is bootstrapping (supabase.auth.getSession() in-flight),
  // user is null but loading is true. Show nothing instead of the sign-in wall
  // — otherwise a signed-in user sees the AuthGate flash on cold app launch.
  if (authLoading) return <View style={s.container} />;
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
      // base64 omitted — upload helper reads file on-demand, keeps capture snappy.
      // exif:true so we can inspect EXIF Orientation and rotate (width,height)
      // to match the visual orientation of the captured image. Without this,
      // landscape photos can report portrait dimensions on iOS, which makes
      // pickAspectRatio snap to 9:16 and flux-2-max renders a tall image.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: true });
      if (!photo?.uri) {
        Alert.alert('Capture Failed', 'We couldn\'t capture that photo. Please try again.');
        return;
      }

      // EXIF Orientation codes (per TIFF 6.0 spec):
      //   1 = normal, 3 = 180°, 6 = 90° CW (camera rotated right),
      //   8 = 90° CCW (camera rotated left). 5/7 are mirrored-rotations
      //   which no stock iOS camera ever produces. Codes 5-8 mean the
      //   captured pixel matrix has width ↔ height swapped relative to the
      //   visual image the user took.
      //
      // We bake the rotation into the pixels so downstream consumers
      // (Supabase /render/image/, flux-2-max, stripped-EXIF browsers) see
      // the correct orientation. Swapping only width/height numbers isn't
      // enough — most tools ignore EXIF metadata entirely.
      // DIAGNOSTIC: dump what expo-camera actually returned. On iOS 26 /
      // iPhone 14 Pro we've observed `photo.exif` being undefined or missing
      // the Orientation field for landscape captures — which was letting the
      // old (EXIF-dependent) path silently skip rotation and upload sideways
      // pixels. These logs surface in `npx react-native log-ios` and EAS
      // Submit/TestFlight device logs so we can confirm which branch fires.
      console.log(
        '[Snap capture] photo meta',
        'uri=' + String(photo.uri).substring(0, 80),
        'w=' + photo.width,
        'h=' + photo.height,
        'hasExif=' + !!photo.exif,
        'exifOrientation=' + (photo.exif?.Orientation ?? '(unset)'),
        'exifKeys=' + (photo.exif ? Object.keys(photo.exif).slice(0, 10).join(',') : '(none)')
      );

      const orientation = photo.exif?.Orientation ?? 1;

      // IMPORTANT: do NOT re-encode with expo-image-manipulator before
      // navigating. Physical iPhone 14 Pro / iOS 26 does not reliably honor
      // EXIF on manipulateAsync decode, so the "normalized" JPEG ships
      // sideways pixels with EXIF stripped — the server then has nothing
      // to rotate by, and flux-2-max sees sideways bytes. We now upload
      // the ORIGINAL device file (EXIF intact) and let Supabase's
      // /render/image/ endpoint handle rotation server-side, which is
      // deterministic. See src/services/supabase.js:uploadRoomPhoto.
      //
      // For display dims (used by pickAspectRatio), we use Image.getSize
      // directly on the original URI. On iOS UIImage honors EXIF at
      // decode time, so getSize returns the visual (post-rotation) dims.
      const { width: finalWidth, height: finalHeight } = await resolveDimensions(
        photo.uri,
        null,
        null,
      );

      console.log(
        '[Snap capture] dims resolved',
        'exifOrientation=' + orientation,
        'rawCaptureWH=' + photo.width + 'x' + photo.height,
        'finalWH=' + finalWidth + 'x' + finalHeight,
        'swapDetected=' + (photo.width !== finalWidth || photo.height !== finalHeight)
      );

      navigation.navigate('Home', {
        capturedPhoto: {
          uri: photo.uri,
          base64: null,
          width: finalWidth,
          height: finalHeight,
        },
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
      // exif:true so library photos (which often have EXIF Orientation set
      // the same way camera captures do) also get rotated correctly.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        exif: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        Alert.alert('Could Not Load Photo', 'Please try picking a different photo.');
        return;
      }
      // Same diagnostic for library photos — some iOS Photos.app exports
      // have EXIF orientation stripped; some don't. Re-encode unconditionally.
      console.log(
        '[Snap library pick] asset meta',
        'uri=' + String(asset.uri).substring(0, 80),
        'w=' + asset.width,
        'h=' + asset.height,
        'hasExif=' + !!asset.exif,
        'exifOrientation=' + (asset.exif?.Orientation ?? '(unset)'),
        'exifKeys=' + (asset.exif ? Object.keys(asset.exif).slice(0, 10).join(',') : '(none)')
      );

      const orientation = asset.exif?.Orientation ?? 1;

      // Do NOT re-encode via expo-image-manipulator. Upload original bytes
      // with EXIF intact and let Supabase /render/image/ rotate server-side.
      // See handleCapture above for the full rationale.
      const { width: finalWidth, height: finalHeight } = await resolveDimensions(
        asset.uri,
        null,
        null,
      );

      console.log(
        '[Snap library pick] dims resolved',
        'exifOrientation=' + orientation,
        'rawAssetWH=' + asset.width + 'x' + asset.height,
        'finalWH=' + finalWidth + 'x' + finalHeight,
        'swapDetected=' + (asset.width !== finalWidth || asset.height !== finalHeight)
      );

      navigation.navigate('Home', {
        capturedPhoto: {
          uri: asset.uri,
          base64: null,
          width: finalWidth,
          height: finalHeight,
        },
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
    // Onboarding escape hatch:
    // Before this fix, a user who denied camera permission while the
    // tutorial was on step 2 (camera) became trapped — the onboarding
    // overlay only renders inside the `permission.granted` branch below,
    // so Skip wasn't reachable. Going back to Home didn't help either,
    // because `currentStep` was already advanced past 'chat_bar', so the
    // step-1 overlay wouldn't re-render on Home. The only way out was to
    // force-quit and re-open the app.
    //
    // Fix: if the tutorial's camera step is active when we render the
    // permission CTA, also render a "Skip tutorial" button so the user
    // can exit the flow without granting camera access.
    //
    // Also added an Open Settings affordance for users who've previously
    // denied permission (`canAskAgain === false`) — `requestPermission`
    // silently no-ops in that case, so the only way to grant is through
    // iOS Settings. Without this, the Enable Camera button looks broken.
    const cameraStepActive = isStepActive('camera');
    const canReprompt = permission.canAskAgain !== false;

    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 32, fontFamily: 'Geist_400Regular' }}>
          Camera access is needed to photograph your room for AI design.
        </Text>
        <TouchableOpacity
          style={s.permBtn}
          onPress={canReprompt ? requestPermission : () => Linking.openSettings?.()}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontFamily: 'Geist_700Bold' }}>
            {canReprompt ? 'Enable Camera' : 'Open Settings'}
          </Text>
        </TouchableOpacity>

        {cameraStepActive && (
          <TouchableOpacity
            onPress={finishOnboarding}
            style={{ marginTop: 8, paddingVertical: 10, paddingHorizontal: 16 }}
            accessibilityLabel="Skip tutorial"
            accessibilityRole="button"
          >
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Geist_400Regular', textDecorationLine: 'underline' }}>
              Skip tutorial
            </Text>
          </TouchableOpacity>
        )}
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
