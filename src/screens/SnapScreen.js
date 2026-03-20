import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { colors } from '../constants/colors';
import { palette, fontSize, fontWeight, space, radius, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { useAuth } from '../context/AuthContext';
import { uploadRoomPhoto } from '../services/supabase';
import { generateInteriorDesign } from '../services/replicate';
import { getProductsForPromptAsync } from '../services/affiliateProducts';

function FlashIcon({ off }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      {off && <Line x1={2} y1={2} x2={22} y2={22} />}
    </Svg>
  );
}

function FlipIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 2v6h-6" />
      <Path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <Path d="M3 22v-6h6" />
      <Path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </Svg>
  );
}

function SparkIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  );
}

function XIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

export default function SnapScreen({ navigation }) {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const cameraRef = useRef(null);

  // Must be logged in to use the AI generation feature
  if (!user) {
    return (
      <View style={styles.permissionContainer}>
        <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <Circle cx={12} cy={13} r={4} />
        </Svg>
        <Text style={styles.permissionTitle}>Sign in to Use Snap</Text>
        <Text style={styles.permissionText}>
          Create a free account to snap your room and generate AI-powered interior designs.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={() => navigation.navigate('Auth')}>
          <Text style={styles.permissionBtnText}>Sign In / Sign Up</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <Circle cx={12} cy={13} r={4} />
        </Svg>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          SnapSpace needs camera access to capture your room and generate AI designs.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || loading) return;
    setLoading(true);
    setStatusText('Capturing photo…');
    try {
      // base64:true gives us the data inline — no FileSystem read needed
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });

      setStatusText('Uploading photo…');
      const imageUrl = await uploadRoomPhoto(user?.id || 'anonymous', photo.uri, photo.base64);

      const designPrompt = prompt || 'Modern minimalist redesign';

      setStatusText('Generating your design… (this takes ~30s)');
      const resultUrl = await generateInteriorDesign(imageUrl, designPrompt);

      setStatusText('Finding matching products…');
      const matchedProducts = await getProductsForPromptAsync(designPrompt, 6);

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

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash ? 'on' : 'off'}
      >
        {/* Top controls */}
        <View style={styles.topControls}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => navigation?.goBack()}>
            <XIcon />
          </TouchableOpacity>
          <View style={styles.topRight}>
            <TouchableOpacity style={styles.controlBtn} onPress={() => setFlash(!flash)}>
              <FlashIcon off={!flash} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}>
              <FlipIcon />
            </TouchableOpacity>
          </View>
        </View>

        {/* Corner guides */}
        <View style={styles.guideContainer}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {/* Bottom overlay */}
        <View style={styles.bottomOverlay}>
          <View style={styles.promptWrap}>
            <SparkIcon />
            <TextInput
              style={styles.promptInput}
              placeholder="Modern minimalist with warm tones..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={prompt}
              onChangeText={setPrompt}
            />
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, loading && styles.generateBtnDisabled]}
            onPress={handleCapture}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <>
                <ActivityIndicator color={colors.white} size="small" />
                {!!statusText && <Text style={styles.statusText}>{statusText}</Text>}
              </>
            ) : (
              <>
                <SparkIcon />
                <Text style={styles.generateText}>Generate with AI</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.textPrimary,
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['3xl'],
  },
  permissionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: palette.textPrimary,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  permissionText: {
    fontSize: fontSize.sm,
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.5,
    marginBottom: space['2xl'],
  },
  permissionBtn: {
    backgroundColor: palette.primaryBlue,
    paddingHorizontal: space['2xl'],
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  permissionBtnText: {
    color: palette.textWhite,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space['5xl'] + space.xs,
    paddingHorizontal: space.lg,
  },
  topRight: {
    flexDirection: 'row',
    gap: space.sm + 2,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideContainer: {
    flex: 1,
    margin: space['3xl'],
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  bottomOverlay: {
    paddingHorizontal: space.lg,
    paddingBottom: space['3xl'],
    gap: space.md + 2,
  },
  promptWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.lg,
    paddingHorizontal: space.base,
    height: 50,
    gap: space.sm + 2,
  },
  promptInput: {
    flex: 1,
    color: palette.textWhite,
    fontSize: fontSize.sm,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryBlue,
    borderRadius: radius.lg,
    height: 54,
    gap: space.sm + 2,
  },
  generateBtnDisabled: {
    opacity: 0.7,
  },
  generateText: {
    color: palette.textWhite,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  statusText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginLeft: space.sm,
  },
});
