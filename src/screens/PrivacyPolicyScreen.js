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

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

// ── Strategic order: approachable at top & bottom, dense compliance in middle ─

const SECTIONS = [
  // ═══ TOP — What users care about ═══
  {
    title: '1. Introduction',
    body: `SnapSpace ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, retain, and safeguard your personal information when you use the SnapSpace mobile application ("App").

This policy is written in plain language wherever possible. By creating an account or using the App, you consent to the data practices described in this policy. If you do not agree, please do not use the App.

This Privacy Policy applies to all users of the App, including consumers, Verified Suppliers, and visitors.`,
  },
  {
    title: '2. AI Processing and Room Photos',
    body: `When you use the AI generation feature, your photos and prompts are processed as follows:

1. Your room photo is uploaded to our secure cloud storage (Supabase Storage) and transmitted over encrypted connections (TLS/SSL)
2. Your photo and prompt are sent to third-party AI model providers (Replicate, Inc. and/or Black Forest Labs GmbH) for image generation
3. The AI-generated result is returned to you and saved to your SnapSpace account
4. Your original room photos are stored in our cloud storage for the purpose of displaying them in your "My Spaces" history

Data Protection Commitments:
• All photo transmissions use industry-standard TLS encryption
• AI model providers process your images solely to generate the requested output — they do not use your images for model training under our data processing agreements
• You can delete individual designs from your My Spaces at any time
• Deleting your account permanently removes all associated photos and designs from our active storage within 30 days

We do not analyze, scan, or process your room photos for any purpose other than delivering the AI generation service you requested.`,
  },
  {
    title: '3. Camera and Photo Library Access',
    body: `SnapSpace requests access to your device's camera and photo library for the following purposes only:

• Camera: To capture room photos for AI design generation
• Photo Library: To select existing room photos for AI design generation and to upload a profile photo

We request these permissions only when you initiate the relevant action (tapping the camera or photo upload button). You can revoke these permissions at any time through your device's system settings.

Photos captured or selected are:
• Uploaded to our secure cloud storage for AI processing
• Not accessed, scanned, or analyzed for any purpose other than delivering the AI generation service
• Not shared with third parties except the AI model providers listed in Section 8, solely for image generation`,
  },
  {
    title: '4. Push Notifications',
    body: `If you grant notification permissions, we may send push notifications to your device. You have full control over which notification types are enabled:

• Activity notifications (likes, follows, order updates) — on by default
• AI Generation Ready — on by default
• Design Tips and Promotions — off by default (opt-in only)
• SnapSpace Newsletter — off by default (opt-in only)

You can manage these preferences at any time in the App (Profile → Settings → Notifications) or by disabling notifications for SnapSpace in your device's system settings.

We use Expo's push notification service to deliver notifications. Your device's push token is stored in our database and is invalidated when you sign out or delete your account.`,
  },
  {
    title: '5. How We Use Your Information',
    body: `We use the information we collect for the following purposes:

Core App Functionality
• To create and maintain your account
• To process your room photos and prompts through AI models and deliver generated designs
• To save your designs, liked content, and shopping cart to your account
• To display your profile to other users (if you share content publicly)
• To match furniture and décor products to your AI-generated designs
• To process subscription and token purchases through Apple's payment system

Communication
• To send push notifications you have opted into (generation status, likes, follows, promotions)
• To respond to your support requests and feature submissions
• To send critical account-related communications (password resets, security alerts)

Improvement and Analytics
• To monitor App performance, stability, and usage trends
• To improve AI generation quality and product matching accuracy
• To identify and fix bugs and technical issues

Safety and Compliance
• To detect and prevent fraud, abuse, and violations of our Terms of Use
• To comply with applicable legal obligations
• To enforce our Terms of Use and protect the rights and safety of our users

We do NOT:
• Sell your personal information to third parties
• Use your personal room photos to train AI models without your explicit opt-in consent
• Share your email address with advertisers or marketing partners
• Build advertising profiles from your usage data`,
  },

  // ═══ MIDDLE — Dense compliance ═══
  {
    title: '6. Information We Collect',
    body: `We collect the following categories of information:

Account Information (provided by you)
• Full name, email address, and password when you register with email
• Apple ID identity token and associated name/email when you sign in with Apple
• Profile photo, username, and bio when you choose to set them
• Referral code, if entered during signup

Room Photos and Prompts (provided by you)
• Photos you capture with your device camera or upload from your photo library for AI room generation
• Text prompts describing your desired design style
• Completed AI-generated designs saved to your account

Usage and Interaction Data (collected automatically)
• Designs you like, save, share, or view
• Products you browse, add to cart, or purchase through affiliate links
• Users you follow and interact with
• AI generation history (prompts used, number of generations)
• Notification preferences you configure

Device and Technical Data (collected automatically)
• Device model, operating system, and version
• App version
• Expo push notification token (if notifications are enabled)
• Crash logs and performance data

Supplier Application Data (if applicable)
• Business name, type, website URL, tax ID, product categories, inventory size, and business description

Payment Information
• We do NOT collect or store credit card numbers, bank account details, or other financial information. All subscription and token purchases are processed exclusively by Apple through the App Store. Apple's payment terms and privacy policy govern those transactions.`,
  },
  {
    title: '7. How We Collect Information',
    body: `We collect information through:

• Direct Input: When you create an account, fill out your profile, write prompts, upload photos, submit a supplier application, or contact support
• Automated Collection: When you interact with the App, certain usage and device data is collected automatically through our backend infrastructure
• Third-Party Services: Our service providers (listed in Section 8) may collect technical data in connection with providing their services
• Apple Sign-In: If you choose to sign in with Apple, Apple provides us with your name and email address (or a private relay email, if you choose to hide your email)`,
  },
  {
    title: '8. Third-Party Service Providers',
    body: `We share your information with the following categories of service providers, solely to operate the App:

Authentication and Database
• Supabase, Inc. — Account authentication, profile storage, database, and file storage (room photos, avatars). Data is stored in Supabase's cloud infrastructure. Privacy policy: supabase.com/privacy

AI Image Generation
• Replicate, Inc. — Processes room photos and prompts to generate AI room designs. Receives your photo and prompt text; returns generated image. Privacy policy: replicate.com/privacy
• Black Forest Labs GmbH — Alternative AI image generation model. Same data handling as above. Privacy policy: blackforestlabs.ai/privacy

Payment Processing
• Apple, Inc. — Processes all subscription and token purchases through App Store In-App Purchase. We do not receive or store your payment details. Privacy policy: apple.com/privacy

Affiliate Commerce
• Amazon.com, Inc. — When you tap a product link, you are directed to Amazon's website or app. Amazon may collect data about your visit according to its own privacy policy. We receive anonymized purchase confirmation data for commission tracking. Privacy policy: amazon.com/privacy

Push Notifications
• Expo (Software Mansion S.A.) — Delivers push notifications to your device using your Expo push token. Privacy policy: expo.dev/privacy

We require all service providers to:
• Process your data only for the specific purpose we have engaged them for
• Maintain appropriate security measures
• Not sell or share your data with unauthorized parties
• Delete your data upon termination of our agreement or upon your request`,
  },
  {
    title: '9. Affiliate Links and Product Data',
    body: `SnapSpace participates in the Amazon Associates Program and may participate in other affiliate programs. When you interact with product listings in the App:

• Product names, images, prices, and descriptions displayed in the App are sourced from our internal product catalog and may not reflect real-time pricing
• Tapping "Buy on Amazon" or similar links redirects you to Amazon's website or app, where Amazon's privacy policy governs
• We receive anonymized confirmation when a qualifying purchase is made (product category and commission amount) — we do not receive your Amazon order details, payment information, or shipping address
• We may use cookie-based affiliate tracking as required by the Amazon Associates Program operating agreement

We never receive or store your payment card details, shipping address, or personal purchase history from any affiliate retailer.`,
  },
  {
    title: '10. Data Retention',
    body: `We retain your personal information according to the following schedule:

• Account data (name, email, profile): Retained as long as your account is active
• Room photos and AI-generated designs: Retained as long as your account is active or until you delete them individually
• Usage data (likes, follows, cart history): Retained as long as your account is active
• Notification preferences: Stored locally on your device; also retained on our servers as long as your account is active
• Supplier application data: Retained for the duration of your supplier relationship, or for 1 year after rejection
• Push notification tokens: Retained as long as your account is active; invalidated upon sign-out

After Account Deletion:
• Active data is deleted within 30 days of your deletion request
• Backup and archived data is purged within 90 days
• Anonymized, aggregated analytics data (which cannot identify you) may be retained indefinitely
• Data required for legal compliance, fraud prevention, or dispute resolution may be retained for up to 1 year after deletion`,
  },
  {
    title: '11. Your Privacy Rights',
    body: `Depending on your jurisdiction, you may have the following rights regarding your personal data:

All Users:
• Access — Request a copy of the personal information we hold about you
• Correction — Request correction of inaccurate or incomplete data
• Deletion — Delete your account and all associated data from within the App (Profile → Settings → Delete Account) or by emailing info@snapspaceios.com
• Portability — Request your data in a commonly used, machine-readable format
• Notification Opt-Out — Manage push notification preferences in the App or via your device settings
• Marketing Opt-Out — Unsubscribe from promotional communications at any time

California Residents (CCPA/CPRA):
• Right to know what personal information we collect and how it is used
• Right to request deletion of your personal information
• Right to opt out of the sale of personal information — SnapSpace does not sell your personal information
• Right to non-discrimination for exercising your privacy rights
• You may designate an authorized agent to make requests on your behalf

European Economic Area / UK Residents (GDPR):
• All rights listed above, plus the right to object to processing and the right to restrict processing
• Legal basis for processing: performance of a contract (providing the App), legitimate interests (improving the App), and consent (notifications, marketing)
• You may lodge a complaint with your local data protection authority

To exercise any of these rights, contact us at info@snapspaceios.com. We will verify your identity and respond to your request within 30 days (45 days if an extension is needed, with notice).`,
  },
  {
    title: '12. Children\'s Privacy',
    body: `SnapSpace is not directed to children under the age of 13. We do not knowingly collect, use, or disclose personal information from children under 13.

If we discover that we have collected personal information from a child under 13 without verified parental consent, we will promptly delete that information and terminate the associated account.

If you are a parent or guardian and believe your child under 13 has provided us with personal information, please contact us immediately at info@snapspaceios.com and we will take appropriate action.

Users between 13 and 17 years of age may use the App only with the consent and supervision of a parent or legal guardian.`,
  },
  {
    title: '13. Data Security',
    body: `We implement industry-standard security measures to protect your personal information, including:

• Encrypted data transmission using TLS/SSL for all network communications
• Secure cloud infrastructure with role-based access controls (Supabase)
• Hashed and salted password storage (managed by Supabase Auth)
• Row-Level Security (RLS) policies on database tables to prevent unauthorized data access
• Secure token-based authentication for API requests
• Device-level secure storage for sensitive credentials (Expo SecureStore)
• Regular review of access permissions and security configurations

Despite these measures, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security of your data. If we become aware of a security breach that affects your personal information, we will notify you in accordance with applicable law.`,
  },
  {
    title: '14. Do Not Track',
    body: `SnapSpace does not currently respond to "Do Not Track" (DNT) browser signals. However, we do not engage in cross-app tracking or behavioral advertising. We do not share your data with advertising networks or data brokers.`,
  },
  {
    title: '15. International Data Transfers',
    body: `Your information may be transferred to and processed in countries other than your country of residence, including the United States, where our service providers operate. These countries may have data protection laws that differ from those in your jurisdiction.

When we transfer your data internationally, we ensure appropriate safeguards are in place, including:
• Standard contractual clauses approved by the European Commission (for EEA/UK transfers)
• Data processing agreements with all service providers
• Compliance with applicable data transfer frameworks

By using the App, you consent to the transfer of your information to the United States and other countries as described in this policy.`,
  },
  {
    title: '16. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or for other operational reasons.

When we make changes:
• We will update the "Last updated" date at the top of this page
• For material changes, we will notify you via in-app notification or email before the changes take effect
• Your continued use of the App after the updated policy becomes effective constitutes your acceptance of the changes

We encourage you to review this Privacy Policy periodically to stay informed about how we protect your information.`,
  },

  // ═══ BOTTOM — Actionable, user-friendly ═══
  {
    title: '17. Account Deletion',
    body: `You can delete your SnapSpace account at any time:

In-App: Profile → Settings → Delete Account
By Email: Send a request to info@snapspaceios.com with the subject "Account Deletion Request"

When you delete your account:
• Your profile, username, bio, and avatar are permanently deleted
• All saved designs, liked content, and My Spaces history are permanently deleted
• Your room photos are permanently deleted from our cloud storage
• Your push notification token is invalidated
• Your shopping cart and order history are cleared

Important:
• Active Apple subscriptions must be canceled separately through your Apple ID settings — account deletion does not automatically cancel subscriptions
• Token balances are forfeited and non-refundable upon account deletion
• Content you shared publicly may have been saved or re-shared by other users — we cannot recall copies made by third parties
• Data deletion from active systems completes within 30 days; backup purge completes within 90 days`,
  },
  {
    title: '18. Contact Us',
    body: `If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:

SnapSpace
Email: info@snapspaceios.com
Website: www.snapspaceios.com

For privacy-specific inquiries, please include "Privacy Inquiry" in the subject line.

For account deletion requests, please include "Account Deletion Request" in the subject line.

We aim to respond to all inquiries within 30 days.`,
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
        <Text style={styles.lastUpdated}>Last updated: April 6, 2026</Text>

        <Text style={styles.intro}>
          Your privacy matters to us. This policy explains exactly what data SnapSpace collects, why we collect it, who we share it with, and how we protect it — written in plain language.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 SnapSpace. All rights reserved.</Text>
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
