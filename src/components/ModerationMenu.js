/**
 * ModerationMenu — Report + Block affordance for community content.
 *
 * Apple Guideline 1.2 requires apps with UGC to provide:
 *   1. A method to report objectionable content
 *   2. A way to block abusive users
 *
 * This component renders a "⋯" (more) icon that opens an iOS ActionSheet
 * (native look) or Alert fallback with Report / Block options. Keeps the
 * footprint tiny — most screens can add it with one line.
 *
 * Usage:
 *   <ModerationMenu
 *     targetUserId={seller?.id}
 *     targetUserName={seller?.displayName}
 *     targetDesignId={design?.id}
 *     currentUserId={user?.id}           // pass to hide menu on own content
 *   />
 */

import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  ActionSheetIOS,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { reportUser, REPORT_REASONS } from '../services/moderation';

function MoreIcon({ size = 22, color = '#111' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5}  cy={12} r={1.8} fill={color} />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
      <Circle cx={19} cy={12} r={1.8} fill={color} />
    </Svg>
  );
}

export default function ModerationMenu({
  targetUserId,
  targetUserName = 'this user',
  targetDesignId = null,
  currentUserId = null,
  iconColor = '#111',
  iconSize = 22,
  style,
  hitSlop = { top: 10, bottom: 10, left: 10, right: 10 },
}) {
  // Hide the menu on the user's own content — you can't report yourself.
  if (!targetUserId || (currentUserId && currentUserId === targetUserId)) {
    return null;
  }

  // Confirm + submit a report with a chosen reason
  const submitReport = useCallback(
    async (reason, alsoBlock) => {
      const result = await reportUser({
        targetUserId,
        targetDesignId,
        reason,
        alsoBlock,
      });
      if (result.success) {
        Alert.alert(
          'Thanks for letting us know',
          alsoBlock
            ? `We received your report. ${targetUserName} has also been blocked — their content won't appear in your feed.`
            : "We received your report. Our team will review this shortly.",
        );
      } else {
        Alert.alert(
          "Couldn't submit report",
          'Please check your connection and try again.',
        );
      }
    },
    [targetUserId, targetDesignId, targetUserName]
  );

  const showReasonPicker = useCallback(
    (alsoBlock) => {
      const reasons = REPORT_REASONS;
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Why are you reporting this?',
            options: [...reasons.map((r) => r.label), 'Cancel'],
            cancelButtonIndex: reasons.length,
          },
          (idx) => {
            if (idx === reasons.length || idx < 0) return;
            submitReport(reasons[idx].value, alsoBlock);
          }
        );
      } else {
        // Android fallback — Alert with a couple of most-common reasons
        Alert.alert('Report reason', '', [
          { text: 'Inappropriate', onPress: () => submitReport('inappropriate', alsoBlock) },
          { text: 'Spam',          onPress: () => submitReport('spam',          alsoBlock) },
          { text: 'Other',         onPress: () => submitReport('other',         alsoBlock) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    },
    [submitReport]
  );

  const openMenu = useCallback(() => {
    const options = ['Report', 'Report and Block', 'Cancel'];
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Options for ${targetUserName}`,
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: 1,
        },
        (idx) => {
          if (idx === 0) showReasonPicker(false);
          else if (idx === 1) showReasonPicker(true);
        }
      );
    } else {
      Alert.alert(
        `Options for ${targetUserName}`,
        '',
        [
          { text: 'Report',           onPress: () => showReasonPicker(false) },
          { text: 'Report and Block', onPress: () => showReasonPicker(true), style: 'destructive' },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  }, [targetUserName, showReasonPicker]);

  return (
    <TouchableOpacity
      onPress={openMenu}
      hitSlop={hitSlop}
      style={[styles.btn, style]}
      accessibilityLabel="More options"
      accessibilityRole="button"
    >
      <MoreIcon size={iconSize} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
