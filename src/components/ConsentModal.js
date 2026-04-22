import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { colors } from '../constants/colors';
import { safeOpenURL } from '../utils/safeOpenURL';

const CONSENT_KEY_PREFIX = '@homegenie_consent_v1:';
const SHOW_DELAY = 15000;

export default function ConsentModal() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user?.id) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    let cancelled = false;

    AsyncStorage.getItem(`${CONSENT_KEY_PREFIX}${user.id}`).then((val) => {
      if (cancelled || val) return;

      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        setVisible(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, SHOW_DELAY);
    });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user?.id]);

  const handleAccept = async () => {
    if (!checked || !user?.id) return;

    const timestamp = new Date().toISOString();
    await AsyncStorage.setItem(`${CONSENT_KEY_PREFIX}${user.id}`, timestamp);

    // DEV-only log: the full email + user.id is PII and we don't want it in
    // production device console output. EAS release builds do NOT strip
    // plain console.log — this line would land in iOS unified logging and
    // could be lifted out via a sysdiagnose or attached-debugger capture.
    // In production, log a sanitized marker only (no email, truncated id)
    // so we can still tell "consent was recorded" from the log stream
    // without leaking identifying information.
    if (__DEV__) {
      console.log(
        `[consent] User ${user.id} (${user.email}) accepted policies at ${timestamp}`
      );
    } else {
      console.log(
        `[consent] accepted | uid=${String(user.id).substring(0, 8)}… | ts=${timestamp}`
      );
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <View style={styles.card}>
          {/* Title */}
          <Text style={styles.title}>Welcome to HomeGenie</Text>
          <Text style={styles.subtitle}>Please review and accept our policies to continue.</Text>

          {/* Policy links */}
          <View style={styles.linkRow}>
            <TouchableOpacity
              onPress={() => safeOpenURL('https://www.homegenieios.com/terms')}
              activeOpacity={0.7}
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>Terms of Use</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => safeOpenURL('https://www.homegenieios.com/privacy')}
              activeOpacity={0.7}
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>

          {/* Checkbox */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setChecked((c) => !c)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I agree to the{' '}
              <Text
                style={styles.inlineLink}
                onPress={() => safeOpenURL('https://www.homegenieios.com/terms')}
              >
                Terms of Use
              </Text>
              {' '}and{' '}
              <Text
                style={styles.inlineLink}
                onPress={() => safeOpenURL('https://www.homegenieios.com/privacy')}
              >
                Privacy Policy
              </Text>
            </Text>
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, !checked && styles.submitBtnDisabled]}
            onPress={handleAccept}
            disabled={!checked}
            activeOpacity={0.85}
          >
            <Text style={[styles.submitLabel, !checked && styles.submitLabelDisabled]}>
              Accept & Continue
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },

  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 24,
  },
  linkBtn: { paddingVertical: 4 },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: colors.blueLight,
    textDecorationLine: 'underline',
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.bluePrimary,
    borderColor: colors.bluePrimary,
  },
  checkmark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: -1,
  },
  checkboxLabel: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#333',
    lineHeight: 16,
  },
  inlineLink: {
    color: colors.bluePrimary,
    fontWeight: '600',
  },

  submitBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  submitLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#FFF',
  },
  submitLabelDisabled: {
    color: '#9CA3AF',
  },
});
