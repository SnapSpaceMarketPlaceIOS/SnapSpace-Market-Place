import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By downloading, installing, or using the SnapSpace mobile application ("App"), you agree to be bound by these Terms of Use ("Terms"). If you do not agree to these Terms, do not use the App.\n\nThese Terms constitute a legally binding agreement between you and SnapSpace, Inc. ("SnapSpace," "we," "us," or "our"). We reserve the right to update these Terms at any time. Continued use of the App after changes are posted constitutes your acceptance of the revised Terms.`,
  },
  {
    title: '2. Description of the App',
    body: `SnapSpace is an AI-powered interior design application that allows users to:\n\n• Photograph or upload images of rooms and spaces\n• Generate AI-reimagined room designs using advanced machine learning models\n• Browse, save, and share interior design inspiration\n• Discover and purchase furniture and home décor products from third-party retailers\n• Manage a shopping cart and order history within the App\n\nSnapSpace is intended for personal, non-commercial use only.`,
  },
  {
    title: '3. User Accounts',
    body: `To access certain features of the App, you must create an account. You agree to:\n\n• Provide accurate, current, and complete information during registration\n• Maintain the security of your account credentials\n• Notify us immediately of any unauthorized use of your account\n• Accept responsibility for all activity that occurs under your account\n\nYou must be at least 13 years of age to create an account. Users under 18 must have parental consent. We reserve the right to terminate accounts that violate these Terms.`,
  },
  {
    title: '4. AI-Generated Content',
    body: `SnapSpace uses third-party AI models to generate room design imagery based on your photos and text prompts. By using the AI generation feature, you acknowledge that:\n\n• AI-generated images are for inspiration and reference purposes only\n• Results may vary and are not guaranteed to match your described preferences\n• Generated images do not constitute professional interior design advice\n• You grant SnapSpace a non-exclusive, royalty-free license to process your uploaded photos solely to provide the generation service\n\nWe do not retain your room photos beyond what is necessary to deliver the AI result.`,
  },
  {
    title: '5. User-Generated Content',
    body: `When you post, upload, or share content on SnapSpace (including design posts, comments, or profile information), you grant SnapSpace a worldwide, non-exclusive, royalty-free license to use, display, and distribute that content within the App and for promotional purposes.\n\nYou represent that you own or have the necessary rights to all content you submit, and that your content does not violate any third-party rights or applicable laws. We reserve the right to remove content that violates these Terms without notice.`,
  },
  {
    title: '6. Purchases and Payments',
    body: `Product purchases made through SnapSpace are fulfilled by third-party retailers. SnapSpace acts as an intermediary and is not responsible for product quality, shipping, returns, or disputes arising from third-party purchases.\n\nAll in-app purchases (subscriptions, premium features) are processed through Apple's App Store payment system and are subject to Apple's terms and conditions. Prices are displayed in USD and are subject to change. Subscription fees are billed in advance on a recurring basis.`,
  },
  {
    title: '7. Prohibited Conduct',
    body: `You agree not to:\n\n• Use the App for any unlawful purpose or in violation of these Terms\n• Upload content that is offensive, harmful, or violates third-party rights\n• Attempt to reverse engineer, decompile, or extract source code from the App\n• Use automated tools, bots, or scrapers to access the App\n• Misrepresent your identity or impersonate others\n• Interfere with the security or integrity of the App or its servers\n• Use the App to send spam or unsolicited communications\n\nViolation of these restrictions may result in immediate account termination.`,
  },
  {
    title: '8. Intellectual Property',
    body: `All content, features, and functionality of the App — including but not limited to the SnapSpace name, logo, design system, AI algorithms, and codebase — are owned by SnapSpace, Inc. and are protected by applicable intellectual property laws.\n\nNothing in these Terms transfers any ownership of SnapSpace intellectual property to you. You may not copy, reproduce, distribute, or create derivative works of App content without our express written permission.`,
  },
  {
    title: '9. Disclaimers and Limitation of Liability',
    body: `THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. SNAPSPACE DOES NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES.\n\nTO THE MAXIMUM EXTENT PERMITTED BY LAW, SNAPSPACE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE APP, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.`,
  },
  {
    title: '10. Governing Law',
    body: `These Terms shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be resolved exclusively in the state or federal courts located in San Francisco County, California.`,
  },
  {
    title: '11. Contact Us',
    body: `If you have any questions about these Terms of Use, please contact us at:\n\nSnapSpace, Inc.\nEmail: legal@snapspace.app\nWebsite: www.snapspace.app`,
  },
];

export default function TermsOfUseScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Terms of Use</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.lastUpdated}>Last updated: March 1, 2026</Text>

        <Text style={styles.intro}>
          Please read these Terms of Use carefully before using the SnapSpace app. These terms govern your access to and use of our AI-powered interior design platform.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 SnapSpace, Inc. All rights reserved.</Text>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.3,
  },

  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

  lastUpdated: {
    fontSize: 12,
    color: '#AAA',
    fontWeight: '500',
    marginBottom: 16,
  },
  intro: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    marginBottom: 28,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.bluePrimary,
  },

  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  sectionBody: {
    fontSize: 14,
    color: '#555',
    lineHeight: 23,
    fontWeight: '400',
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
    paddingTop: 20,
    marginTop: 8,
    alignItems: 'center',
  },
  footerText: { fontSize: 12, color: '#BBB' },
});
