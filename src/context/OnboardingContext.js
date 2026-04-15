/**
 * OnboardingContext — One-time guided tutorial for new users.
 *
 * 4-step walkthrough that plays ONCE after first account creation:
 *   Step 1: HomeScreen AI chat bar (blue glow + tooltip)
 *   Step 2: SnapScreen camera (blue glow + tooltip)
 *   Step 3: ExploreScreen first product (blue glow + tooltip)
 *   Step 4: ProductDetailScreen genie lamp button (blue glow + tooltip)
 *
 * Uses AsyncStorage to persist completion flag.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OnboardingContext = createContext(null);
const STORAGE_KEY = '@homegenie_onboarding_complete';

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
  const [active, setActive] = useState(false);       // is onboarding running?
  const [currentStep, setCurrentStep] = useState(null); // current step key
  const [completed, setCompleted] = useState(true);   // assume completed until checked

  // Check if onboarding has been completed
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setCompleted(value === 'true');
    }).catch(() => setCompleted(true));
  }, []);

  // Start the onboarding flow
  const startOnboarding = useCallback(() => {
    if (completed) return;
    setActive(true);
    setCurrentStep('chat_bar');
  }, [completed]);

  // Mark onboarding as needed (called after first sign-up + sign-in)
  const enableOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false').catch(() => {});
    setCompleted(false);
  }, []);

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

  // Skip/finish onboarding
  const finishOnboarding = useCallback(async () => {
    setActive(false);
    setCurrentStep(null);
    setCompleted(true);
    await AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
  }, []);

  // Check if a specific step is active
  const isStepActive = useCallback((stepKey) => {
    return active && currentStep === stepKey;
  }, [active, currentStep]);

  return (
    <OnboardingContext.Provider value={{
      active,
      currentStep,
      completed,
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
