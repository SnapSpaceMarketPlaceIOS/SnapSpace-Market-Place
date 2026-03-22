import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';
import { palette, space, radius } from '../constants/tokens';
import { useAuth } from '../context/AuthContext';
import { uploadRoomPhoto } from '../services/supabase';
import { generateInteriorDesign, uploadImageToReplicate } from '../services/replicate';
import { getProductsForPrompt } from '../services/affiliateProducts';

// ─── Icons ───────────────────────────────────────────────────────────────────

function SparkIcon({ size = 20, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  );
}

function CameraIcon({ size = 22, color = palette.primaryBlue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

function GalleryIcon({ size = 22, color = palette.primaryBlue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

function XIcon({ size = 16, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// ─── Furniture label map ──────────────────────────────────────────────────────

const FURNITURE_LABELS = {
  'sofa':         'sofa',
  'accent-chair': 'accent chair',
  'coffee-table': 'coffee table',
  'rug':          'area rug',
  'wall-art':     'wall art',
  'mirror':       'floor mirror',
  'side-table':   'side table',
  'bookshelf':    'bookshelf',
  'floor-lamp':   'floor lamp',
  'table-lamp':   'table lamp',
  'nightstand':   'nightstand',
  'dresser':      'dresser',
  'bed':          'bed',
  'pendant-light':'pendant light',
};

// Visual keywords extracted from product names — helps AI draw what we'll show
const VISUAL_WORDS = [
  'boucle','velvet','leather','linen','rattan','jute','wool','chenille',
  'marble','glass','wood','walnut','oak','brass','gold','concrete',
  'curved','round','oval','modular','sectional','oversized','wavy',
  'abstract','geometric','textured','3d','layered',
  'cream','beige','white','gray','black','camel','sage','green','brown',
];

function extractVisualHints(name) {
  const lower = name.toLowerCase();
  return VISUAL_WORDS.filter(w => lower.includes(w)).slice(0, 2).join(' ');
}

/**
 * Builds an enriched generation prompt that names the SPECIFIC furniture pieces
 * from the pre-selected products. This way the AI draws furniture that matches
 * what will appear in "Shop This Look".
 *
 * @param {string}   userPrompt - The original user style prompt
 * @param {object[]} products   - Pre-selected matched products
 * @returns {string}            - Enriched generation prompt
 */
function buildEnrichedPrompt(userPrompt, products) {
  const pieces = products.slice(0, 4).map(p => {
    const label = FURNITURE_LABELS[p.category] || p.category.replace(/-/g, ' ');
    const hints = extractVisualHints(p.name);
    return hints ? `${hints} ${label}` : label;
  });

  const furnitureList = pieces.length > 0 ? `, with ${pieces.join(', ')}` : '';
  return `${userPrompt}${furnitureList}, fully furnished interior, warm soft lighting`;
}

// ─── Style suggestions ────────────────────────────────────────────────────────

const PROMPT_SUGGESTIONS = [
  'Modern minimalist with warm tones',
  'Japandi natural wood & linen',
  'Dark luxe velvet & brass',
  'Bright coastal, rattan & white',
  'Boho eclectic with plants',
  'Scandinavian clean & cozy',
];

// ─── Camera Modal ─────────────────────────────────────────────────────────────

function CameraModal({ onCapture, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState(false);
  const cameraRef = useRef(null);

  if (!permission) return <View style={camStyles.container} />;

  if (!permission.granted) {
    return (
      <View style={[camStyles.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 32 }}>
          Camera access is required to take room photos.
        </Text>
        <TouchableOpacity style={camStyles.permBtn} onPress={requestPermission}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Grant Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[camStyles.permBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: true });
    onCapture(photo);
  };

  return (
    <View style={camStyles.container}>
      <CameraView ref={cameraRef} style={camStyles.camera} facing={facing} flash={flash ? 'on' : 'off'}>
        <View style={camStyles.topBar}>
          <TouchableOpacity style={camStyles.btn} onPress={onClose}>
            <XIcon />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={camStyles.btn} onPress={() => setFlash(!flash)}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                {!flash && <Line x1={2} y1={2} x2={22} y2={22} />}
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity style={camStyles.btn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M21 2v6h-6" /><Path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <Path d="M3 22v-6h6" /><Path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>
        <View style={camStyles.guides}>
          <View style={[camStyles.corner, { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[camStyles.corner, { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 }]} />
          <View style={[camStyles.corner, { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[camStyles.corner, { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 }]} />
        </View>
        <View style={camStyles.shutterWrap}>
          <TouchableOpacity style={camStyles.shutter} onPress={handleCapture} activeOpacity={0.8}>
            <View style={camStyles.shutterInner} />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const camStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20 },
  btn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  permBtn: { backgroundColor: palette.primaryBlue, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  guides: { flex: 1, margin: 40 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: 'rgba(255,255,255,0.7)' },
  shutterWrap: { alignItems: 'center', paddingBottom: 52 },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
});

// ─── Main SnapScreen ──────────────────────────────────────────────────────────

export default function SnapScreen({ navigation }) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [showCamera, setShowCamera] = useState(false);

  // ── Auth gate ──
  if (!user) {
    return (
      <View style={styles.gate}>
        <LinearGradient colors={[colors.heroStart, colors.heroEnd]} style={StyleSheet.absoluteFill} />
        <View style={styles.gateInner}>
          <View style={styles.gateIconWrap}>
            <SparkIcon size={28} color={palette.primaryBlue} />
          </View>
          <Text style={styles.gateTitle}>Design with AI</Text>
          <Text style={styles.gateBody}>
            Sign in to snap your room and get AI-powered redesigns with shoppable products.
          </Text>
          <TouchableOpacity style={styles.gateBtn} onPress={() => navigation.navigate('Auth')}>
            <Text style={styles.gateBtnText}>Sign In / Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Camera modal ──
  if (showCamera) {
    return (
      <CameraModal
        onCapture={(captured) => { setPhoto(captured); setShowCamera(false); }}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  // ── Generation ──
  const runGeneration = async () => {
    if (!prompt.trim()) {
      Alert.alert('Describe Your Style', 'Add a style description so the AI knows what to create.');
      return;
    }
    if (!photo) {
      Alert.alert('Add a Room Photo', 'Take a photo or choose one from your library to get started.');
      return;
    }
    const designPrompt = prompt.trim();
    setLoading(true);
    try {
      // ── Step 1: Pre-select products so we can build the generation prompt from them
      setStatusText('Curating products…');
      const matchedProducts = getProductsForPrompt(designPrompt, 6);

      // ── Step 2: Build enriched prompt that names the specific furniture pieces
      // This makes the AI draw exactly what we'll show in Shop This Look
      const enrichedPrompt = buildEnrichedPrompt(designPrompt, matchedProducts);

      // ── Step 3: Upload the room photo
      setStatusText('Uploading photo…');
      let imageUrl;
      try {
        imageUrl = await uploadRoomPhoto(user?.id || 'anonymous', photo.uri, photo.base64);
      } catch {
        setStatusText('Uploading via Replicate…');
        imageUrl = await uploadImageToReplicate(photo.base64);
      }

      // ── Step 4: Generate with the furniture-specific prompt
      setStatusText('Generating your design… (40–90s)');
      const resultUrl = await generateInteriorDesign(imageUrl, enrichedPrompt);
      setLoading(false);
      setStatusText('');
      navigation?.navigate('RoomResult', {
        imageUri: photo.uri,
        resultUri: resultUrl,
        prompt: designPrompt,
        products: matchedProducts,
      });
    } catch (err) {
      setLoading(false);
      setStatusText('');
      Alert.alert('Generation Failed', err.message || 'Something went wrong. Please try again.');
    }
  };

  const handlePickFromLibrary = async () => {
    if (loading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, base64: asset.base64 });
  };

  const canGenerate = !!photo && !!prompt.trim() && !loading;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>Design Your Space</Text>
          <Text style={styles.subtitle}>Describe your style, then add your room photo</Text>
        </View>

        {/* ── Prompt section ── */}
        <View style={styles.section}>
          <Text style={styles.label}>Your style</Text>
          <TextInput
            style={styles.textArea}
            placeholder="e.g. Modern minimalist with warm wood tones and natural light…"
            placeholderTextColor="rgba(15,23,42,0.35)"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pills}
          >
            {PROMPT_SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.pill, prompt === s && styles.pillOn]}
                onPress={() => setPrompt(s)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, prompt === s && styles.pillTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Photo section ── */}
        <View style={styles.section}>
          <Text style={styles.label}>Your room</Text>

          {photo ? (
            <View style={styles.preview}>
              <Image source={{ uri: photo.uri }} style={styles.previewImg} resizeMode="cover" />
              <TouchableOpacity style={styles.removeBtn} onPress={() => setPhoto(null)}>
                <XIcon size={14} />
              </TouchableOpacity>
              <View style={styles.readyBadge}>
                <Text style={styles.readyText}>Photo ready ✓</Text>
              </View>
            </View>
          ) : (
            <View style={styles.photoRow}>
              <TouchableOpacity style={styles.photoOption} onPress={() => setShowCamera(true)} activeOpacity={0.7}>
                <View style={styles.photoIconWrap}>
                  <CameraIcon size={24} />
                </View>
                <Text style={styles.photoOptionLabel}>Take Photo</Text>
                <Text style={styles.photoOptionSub}>Use camera</Text>
              </TouchableOpacity>

              <View style={styles.photoSep} />

              <TouchableOpacity style={styles.photoOption} onPress={handlePickFromLibrary} activeOpacity={0.7}>
                <View style={styles.photoIconWrap}>
                  <GalleryIcon size={24} />
                </View>
                <Text style={styles.photoOptionLabel}>Choose Photo</Text>
                <Text style={styles.photoOptionSub}>From library</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Generate button ── */}
        <TouchableOpacity
          style={[styles.genBtn, !canGenerate && styles.genBtnOff]}
          onPress={runGeneration}
          disabled={!canGenerate}
          activeOpacity={0.88}
        >
          {loading ? (
            <View style={styles.genRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.genText}>{statusText || 'Generating…'}</Text>
            </View>
          ) : (
            <View style={styles.genRow}>
              <SparkIcon size={18} />
              <Text style={styles.genText}>Generate with AI</Text>
            </View>
          )}
        </TouchableOpacity>

        {!photo && !loading && (
          <Text style={styles.hint}>
            {!prompt.trim() ? 'Describe your style above to get started' : 'Add a room photo to enable generation'}
          </Text>
        )}

        <Text style={styles.disclosure}>
          AI designs are for inspiration. Products matched from SnapSpace catalog.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 48 },

  // Header
  header: { marginBottom: 28 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: 'rgba(15,23,42,0.5)', marginTop: 4, lineHeight: 20 },

  // Sections
  section: { marginBottom: 4 },
  label: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase', color: 'rgba(15,23,42,0.4)',
    marginBottom: 10,
  },

  // Prompt
  textArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    padding: 14,
    fontSize: 15,
    color: '#0F172A',
    lineHeight: 22,
    minHeight: 88,
    marginBottom: 12,
  },

  // Pills
  pills: { gap: 8, paddingBottom: 2 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F1F5F9',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  pillOn: { backgroundColor: palette.primaryBlue, borderColor: palette.primaryBlue },
  pillText: { fontSize: 12, fontWeight: '500', color: 'rgba(15,23,42,0.6)' },
  pillTextOn: { color: '#fff', fontWeight: '600' },

  // Divider
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 24 },

  // Photo picker
  photoRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(11,109,195,0.15)',
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: '#F8FBFF',
  },
  photoOption: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, gap: 8,
  },
  photoIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(11,109,195,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoOptionLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  photoOptionSub: { fontSize: 11, color: 'rgba(15,23,42,0.45)' },
  photoSep: { width: 1, backgroundColor: 'rgba(11,109,195,0.12)', marginVertical: 20 },

  // Photo preview
  preview: { borderRadius: 14, overflow: 'hidden', height: 200 },
  previewImg: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  readyBadge: {
    position: 'absolute', bottom: 10, left: 10,
    backgroundColor: 'rgba(22,163,74,0.92)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  readyText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Generate
  genBtn: {
    backgroundColor: palette.primaryBlue,
    borderRadius: 16, height: 56,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 28,
    shadowColor: palette.primaryBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  genBtnOff: { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
  genRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  genText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Hint + disclosure
  hint: { textAlign: 'center', fontSize: 12, color: 'rgba(15,23,42,0.4)', marginTop: 10 },
  disclosure: { fontSize: 10, color: 'rgba(15,23,42,0.3)', textAlign: 'center', marginTop: 20, lineHeight: 14, fontStyle: 'italic' },

  // Gate
  gate: { flex: 1 },
  gateInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  gateIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  gateTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 10 },
  gateBody: { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 21, marginBottom: 32 },
  gateBtn: { backgroundColor: '#fff', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 },
  gateBtnText: { color: palette.primaryBlue, fontSize: 15, fontWeight: '700' },
});
