/**
 * ErrorBoundary — top-level uncaught-exception fallback.
 *
 * Wraps the navigation tree so any uncaught exception in a screen or its
 * descendants gets caught, the crash gets reported, and the user sees a
 * friendly "Something went wrong" screen with a "Try again" button —
 * instead of the React Native red box (in dev) or a frozen white screen
 * (in TestFlight / App Store builds).
 *
 * Without this, a single rogue render-time exception = force-quit-required
 * crash. This buys us graceful recovery + observability.
 *
 * Caveats:
 *   - React error boundaries only catch render-phase errors, lifecycle
 *     errors, and constructor errors. They do NOT catch async errors
 *     (Promise rejections, setTimeout callbacks, event handlers).
 *     Those still need try/catch at the call site.
 *   - We sit OUTSIDE the NavigationContainer so we can render even if
 *     navigation itself blew up. The fallback uses no navigation APIs.
 *
 * Recovery model:
 *   - "Try again" resets the boundary's state, which re-mounts the
 *     children. If the underlying bug is transient (network, race), this
 *     is enough to recover. If it's deterministic, the user will land
 *     on the same screen and likely re-trigger — that's expected; the
 *     point is they're not stuck on a white screen with no path forward.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { palette, space, radius, typeScale, fontWeight } from '../constants/tokens';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError:    false,
      error:       null,
      errorCount:  0,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to Console.app for forensic analysis. Could also wire into PostHog
    // here if you want production crash visibility — using analytics.captureEvent
    // would be the right hook (deferred for now to keep the boundary minimal).
    console.error('[ErrorBoundary] caught:', error?.message || error);
    if (errorInfo?.componentStack) {
      console.error('[ErrorBoundary] componentStack:', errorInfo.componentStack);
    }

    // Light bookkeeping so we can detect repeat-failures and avoid an
    // infinite reset loop if the user keeps hitting "Try again" on a
    // deterministic crash. After 3 attempts we keep showing the fallback
    // but switch the copy to "Please relaunch HomeGenie."
    this.setState((prev) => ({ errorCount: (prev.errorCount || 0) + 1 }));
  }

  handleRetry = () => {
    // Resetting state re-mounts children. The same crash may recur — that's
    // OK; the user is no longer stranded on a white screen.
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const tooManyRetries = this.state.errorCount >= 3;

    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.emoji}>🪄</Text>
          <Text style={styles.title}>
            {tooManyRetries ? 'Something\'s not right' : 'Hmm, that didn\'t work'}
          </Text>
          <Text style={styles.body}>
            {tooManyRetries
              ? 'HomeGenie ran into a problem we couldn\'t recover from. ' +
                'Please force-quit and reopen the app.'
              : 'We hit an unexpected hiccup. Tap below and we\'ll try to ' +
                'pick up where you left off.'}
          </Text>

          {!tooManyRetries && (
            <Pressable
              onPress={this.handleRetry}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          )}

          {__DEV__ && this.state.error?.message && (
            <Text style={styles.devHint} numberOfLines={6}>
              dev: {String(this.state.error.message)}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  center: {
    flex: 1,
    paddingHorizontal: space.xl,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 56,
    marginBottom: space.lg,
  },
  title: {
    ...typeScale.display,
    color: palette.textPrimary,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  body: {
    ...typeScale.body,
    color: palette.textSecondary,
    textAlign: 'center',
    marginBottom: space.xl,
    maxWidth: 320,
  },
  button: {
    backgroundColor: palette.primaryBlue,
    paddingVertical: space.base,
    paddingHorizontal: space['2xl'],
    borderRadius: radius.button,
    minWidth: 180,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typeScale.button,
    color: palette.textWhite,
    fontWeight: fontWeight.semibold,
  },
  devHint: {
    ...typeScale.caption,
    color: palette.textTertiary,
    textAlign: 'center',
    marginTop: space.xl,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});

export default ErrorBoundary;
