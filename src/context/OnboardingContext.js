/**
 * OnboardingContext — One-time guided tutorial for new users.
 *
 * 3-step walkthrough that plays ONCE per user account:
 *   Step 1: HomeScreen AI chat bar (blue glow + tooltip)
 *   Step 2: SnapScreen camera (blue glow + tooltip)
 *   Step 3: ProductDetailScreen genie lamp button (blue glow + tooltip)
 *
 * Uses AsyncStorage to persist completion flag, NAMESPACED BY USER ID so
 * multiple accounts on the same device each get their own tutorial once.
 * A missing key = has never completed onboarding → show tutorial.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const OnboardingContext = createContext(null);
const STORAGE_KEY_BASE = '@homegenie_onboarding_complete';

// Build the per-user storage key. Returns null if there's no signed-in user.
const getStorageKey = (userId) => (userId ? `${STORAGE_KEY_BASE}_${userId}` : null);

// Legacy device-wide key — migrated/cleaned up at mount so it doesn't
// pollute new accounts.
const LEGACY_STORAGE_KEY = '@homegenie_onboarding_complete';

// Step definitions with tooltip content
export const ONBOARDING_STEPS = {
  CHAT_BAR: {
    key: 'chat_bar',
    step: 1,
    title: 'Describe Your Dream Room',
    body: 'Type a prompt like "Modern living room with brown leather sofa and oak coffee table" — the more specific, the better the AI output.',
    buttonLabel: 'Got it',
  },
  CAMERA: {
    key: 'camera',
    step: 2,
    title: 'Snap Your Room',
    body: 'Take a photo of your actual room or pick one from your gallery. The AI will redesign it based on your prompt while keeping the layout.',
    buttonLabel: 'Next',
  },
  GENIE_LAMP: {
    key: 'genie_lamp',
    step: 3,
    title: 'Visualize in Your Room',
    body: 'Tap the genie lamp icon above to see how this product looks in your room. Snap a photo and the AI places it right in your space.',
    buttonLabel: 'Start Designing',
    showGenieIcon: true,
  },
};

const STEP_ORDER = ['chat_bar', 'camera', 'genie_lamp'];
const TOTAL_STEPS = STEP_ORDER.length;

export function OnboardingProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || null;

  const [active, setActive] = useState(false);          // is onboarding running?
  const [currentStep, setCurrentStep] = useState(null); // current step key
  const [completed, setCompleted] = useState(true);     // assume completed until checked
  const [loaded, setLoaded] = useState(false);          // true once AsyncStorage resolves

  // Re-read the per-user onboarding flag whenever the signed-in user changes.
  // - No user signed in  → reset state, do not trigger onboarding
  // - Key missing for this user → treat as "needs onboarding" (first-time user)
  // - Key === 'true'     → already completed
  // - Key === 'false'    → explicitly enabled but not yet finished
  useEffect(() => {
    let cancelled = false;

    // Always kill any in-progress tour when user changes (sign-out or switch)
    setActive(false);
    setCurrentStep(null);

    if (!userId) {
      // No user → don't try to load anything. Treat as completed so no
      // overlay can render before login.
      setCompleted(true);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    const key = getStorageKey(userId);

    (async () => {
      try {
        // One-time cleanup: if the legacy device-wide key still exists,
        // remove it so it can't bleed into new accounts on this device.
        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy !== null) {
          await AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
        }

        const value = await AsyncStorage.getItem(key);
        if (cancelled) return;
        // Only 'true' counts as completed. Missing key or any other value
        // means this user still needs to see the tutorial.
        setCompleted(value === 'true');
        setLoaded(true);
      } catch {
        if (cancelled) return;
        setCompleted(true);
        setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // Start the onboarding flow — only runs if AsyncStorage has loaded AND not completed
  const startOnboarding = useCallback(() => {
    if (!loaded || completed) return;
    setActive(true);
    setCurrentStep('chat_bar');
  }, [loaded, completed]);

  // Explicitly mark the current user as needing onboarding.
  // Called from AuthScreen after a fresh signup. Safe no-op if no user yet
  // (signup-with-email-verification has no active session until verified;
  //  the useEffect above will auto-show onboarding on first sign-in because
  //  the key won't exist yet).
  const enableOnboarding = useCallback(async () => {
    const key = getStorageKey(userId);
    if (!key) return;
    await AsyncStorage.setItem(key, 'false').catch(() => {});
    setCompleted(false);
  }, [userId]);

  // Advance to next step
  const nextStep = useCallback(() => {
    const idx = STEP_ORDER.indexOf(currentStep);
    if (idx < STEP_ORDER.length - 1) {
      setCurrentStep(STEP_ORDER[idx + 1]);
    } else {
      // Onboarding complete
      finishOnboarding();
    }
  }, [currentStep]);

  // Go back to previous step
  const prevStep = useCallback(() => {
    const idx = STEP_ORDER.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(STEP_ORDER[idx - 1]);
    }
  }, [currentStep]);

  // Skip/finish onboarding — writes 'true' to THIS user's key only
  const finishOnboarding = useCallback(async () => {
    setActive(false);
    setCurrentStep(null);
    setCompleted(true);
    const key = getStorageKey(userId);
    if (key) {
      await AsyncStorage.setItem(key, 'true').catch(() => {});
    }
  }, [userId]);

  // Check if a specific step is active
  const isStepActive = useCallback((stepKey) => {
    return active && currentStep === stepKey;
  }, [active, currentStep]);

  return (
    <OnboardingContext.Provider value={{
      active,
      currentStep,
      completed,
      loaded,
      startOnboarding,
      enableOnboarding,
      nextStep,
      prevStep,
      finishOnboarding,
      isStepActive,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be inside OnboardingProvider');
  return ctx;
}
