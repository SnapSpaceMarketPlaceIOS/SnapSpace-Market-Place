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

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

const SECTIONS = [
  {
    title: '1. Introduction',
    body: `SnapSpace, Inc. ("SnapSpace," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the SnapSpace mobile application ("App").\n\nBy using the App, you consent to the data practices described in this policy. If you do not agree with the terms of this Privacy Policy, please do not access the App.`,
  },
  {
    title: '2. Information We Collect',
    body: `We may collect the following types of information:\n\nAccount Information\n• Name, email address, and username when you register\n• Profile photo and banner image you choose to upload\n• Bio and other optional profile details\n\nUsage Data\n• Pages and features you interact with within the App\n• Designs you like, share, or save\n• Cart activity and purchase history\n• Device type, operating system, and app version\n\nPhotos & Camera\n• Room photos you capture or upload for AI generation (processed and not stored beyond delivery of the result)\n\nCommunications\n• Messages you send through in-app support or feedback features`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We use the information we collect to:\n\n• Provide, maintain, and improve the App and its features\n• Process and fulfill your orders and purchases\n• Personalize your design recommendations and AI results\n• Send you order confirmations, shipping updates, and support responses\n• Send promotional communications (only with your consent)\n• Monitor and analyze usage trends to improve performance\n• Detect, prevent, and address technical issues and security threats\n• Comply with legal obligations\n\nWe do not sell your personal information to third parties.`,
  },
  {
    title: '4. AI Processing and Room Photos',
    body: `When you use the SnapSpace AI generation feature, photos you capture or upload are transmitted to our AI processing partners to generate your room design result. We take the following measures to protect this data:\n\n• Photos are transmitted over encrypted connections (TLS)\n• Images are processed in real-time and are not stored on our servers beyond what is needed to deliver your result\n• We do not use your room photos to train AI models without your explicit consent\n• You can delete your account at any time, which removes any associated data from our systems`,
  },
  {
    title: '5. Sharing Your Information',
    body: `We may share your information in the following limited circumstances:\n\nService Providers\nWe work with trusted third-party vendors who assist in operating the App (e.g., cloud hosting, analytics, payment processing). These partners are contractually bound to keep your information confidential.\n\nRetail Partners\nWhen you make a purchase through the App, necessary order details are shared with the fulfilling retailer to process and ship your order.\n\nLegal Requirements\nWe may disclose your information if required by law, court order, or government regulation, or if we believe disclosure is necessary to protect the rights, property, or safety of SnapSpace, our users, or the public.\n\nBusiness Transfers\nIn the event of a merger, acquisition, or asset sale, your information may be transferred as part of that transaction.`,
  },
  {
    title: '6. Data Retention',
    body: `We retain your personal information for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time by contacting us at privacy@snapspace.app.\n\nSome information may be retained for a limited period after account deletion for legitimate business purposes such as fraud prevention, legal compliance, or dispute resolution.`,
  },
  {
    title: '7. Cookies and Tracking Technologies',
    body: `The App may use cookies, pixel tags, and similar technologies to collect usage data, remember your preferences, and improve performance. You can control cookie settings through your device's operating system settings.\n\nWe may also use third-party analytics tools (such as Firebase or Mixpanel) to understand App usage patterns. These tools may collect device identifiers and usage data subject to their own privacy policies.`,
  },
  {
    title: '8. Your Privacy Rights',
    body: `Depending on your location, you may have the following rights regarding your personal data:\n\n• Access — Request a copy of the personal information we hold about you\n• Correction — Request correction of inaccurate or incomplete data\n• Deletion — Request deletion of your personal data\n• Portability — Request your data in a portable format\n• Opt-Out — Unsubscribe from marketing communications at any time\n\nTo exercise any of these rights, contact us at privacy@snapspace.app. We will respond to your request within 30 days.`,
  },
  {
    title: '9. Children\'s Privacy',
    body: `SnapSpace is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected data from a child under 13 without parental consent, we will take steps to delete that information promptly.\n\nIf you are a parent or guardian and believe your child has provided us with personal information, please contact us at privacy@snapspace.app.`,
  },
  {
    title: '10. Security',
    body: `We implement industry-standard security measures to protect your personal information, including:\n\n• Encrypted data transmission using TLS/SSL\n• Secure cloud infrastructure with access controls\n• Regular security assessments and vulnerability testing\n• Strict internal access policies limiting who can view your data\n\nHowever, no method of transmission over the internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your data, we cannot guarantee absolute security.`,
  },
  {
    title: '11. Third-Party Links and Services',
    body: `The App may contain links to third-party websites or services, including retailer product pages. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party services you access through the App.`,
  },
  {
    title: '12. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. When we make changes, we will update the "Last updated" date at the top of this page and, if changes are material, notify you via in-app notification or email.\n\nYour continued use of the App after any changes constitutes your acceptance of the updated Privacy Policy.`,
  },
  {
    title: '13. Contact Us',
    body: `If you have any questions, concerns, or requests regarding this Privacy Policy, please contact our Privacy Team at:\n\nSnapSpace, Inc.\nEmail: privacy@snapspace.app\nWebsite: www.snapspace.app/privacy`,
  },
];

export default function PrivacyPolicyScreen({ navigation }) {
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
          <Text style={styles.headerTitle}>Privacy Policy</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.lastUpdated}>Last updated: March 1, 2026</Text>

        <Text style={styles.intro}>
          Your privacy matters to us. This policy explains what data SnapSpace collects, why we collect it, and how we protect it — written in plain language wherever possible.
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
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
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
