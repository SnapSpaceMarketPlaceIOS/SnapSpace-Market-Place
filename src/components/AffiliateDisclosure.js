/**
 * AffiliateDisclosure — small inline notice shown on every screen where
 * affiliate product links appear. Required for both FTC endorsement
 * guidelines (disclose commission clearly and near the product link, not
 * buried in Terms of Use) and Apple App Store Review Guideline 2.3.1
 * (misleading marketing practices).
 *
 * Keep the copy SHORT and NEUTRAL — "we may earn a commission" is the
 * FTC-approved phrasing. Don't embellish. Apple reviewers sometimes flag
 * disclosures that sound promotional ("Shop amazing deals! We earn...") —
 * the plainer the better.
 *
 * Usage:
 *   import AffiliateDisclosure from '../components/AffiliateDisclosure';
 *   <AffiliateDisclosure />
 *
 * Or with custom spacing:
 *   <AffiliateDisclosure style={{ marginVertical: 12 }} />
 */
import React from 'react';
import { Text, StyleSheet } from 'react-native';

export default function AffiliateDisclosure({ style }) {
  return (
    <Text style={[styles.text, style]}>
      We may earn a commission when you buy through links on this app.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11,
    lineHeight: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    fontFamily: 'Geist_400Regular',
  },
});
