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

// ── Strategic order: approachable at top & bottom, dense legal in middle ──────

const SECTIONS = [
  // ═══ TOP — What users care about ═══
  {
    title: '1. Acceptance of Terms',
    body: `By downloading, installing, or using the HomeGenie mobile application ("App"), you agree to be bound by these Terms of Use ("Terms"). If you do not agree to these Terms, do not use the App.

These Terms constitute a legally binding agreement between you and HomeGenie ("we," "us," or "our"). We reserve the right to update these Terms at any time by posting the revised version within the App and updating the "Last updated" date. Continued use of the App after changes are posted constitutes your acceptance of the revised Terms. If a change is material, we will notify you via in-app notification or email before it takes effect.`,
  },
  {
    title: '2. Description of the App',
    body: `HomeGenie is an AI-powered interior design application that allows users to:

• Photograph or upload images of rooms and interior spaces
• Write text prompts describing a desired design style
• Generate AI-reimagined room designs using third-party machine learning models
• Browse a curated feed of community-shared room designs
• Discover furniture and home décor products matched to AI-generated designs
• Purchase products through affiliate links to third-party retailers (primarily Amazon)
• Save designs, follow other users, and interact with shared content
• Apply to become a Verified Supplier on the marketplace

HomeGenie is intended for personal, non-commercial use unless you have been approved as a Verified Supplier.`,
  },
  {
    title: '3. Eligibility',
    body: `You must be at least 13 years of age to use the App. If you are between 13 and 17 years old, you must have the permission and supervision of a parent or legal guardian who agrees to be bound by these Terms on your behalf.

By creating an account, you represent and warrant that you meet the eligibility requirements stated above. We reserve the right to request proof of age at any time and to terminate accounts that do not meet these requirements.`,
  },
  {
    title: '4. User Accounts',
    body: `To access certain features — including AI generation, saving designs, following users, and managing a shopping cart — you must create an account using either an email address and password or Apple Sign-In.

You agree to:

• Provide accurate, current, and complete information during registration
• Maintain the security and confidentiality of your login credentials
• Notify us immediately at info@homegenie.app of any unauthorized use of your account
• Accept sole responsibility for all activity that occurs under your account

We reserve the right to suspend or terminate accounts that violate these Terms, remain inactive for an extended period, or are reasonably suspected of fraudulent activity.`,
  },
  {
    title: '5. Subscriptions and In-App Purchases',
    body: `HomeGenie offers the following paid features, all processed exclusively through Apple's In-App Purchase system:

Auto-Renewable Subscriptions

• Basic ($6.99/month), Pro ($12.99/month), and Premium ($19.99/month) plans
• Each plan provides a monthly quota of AI room generations and access to premium features
• Payment is charged to your Apple ID account at confirmation of purchase
• Subscriptions automatically renew unless canceled at least 24 hours before the end of the current billing period
• Your account will be charged for renewal within 24 hours prior to the end of the current period at the same price
• You can manage and cancel subscriptions at any time through your Apple ID settings (Settings → [Your Name] → Subscriptions)
• No refunds are provided for partial billing periods upon cancellation
• Any unused portion of a free trial, if offered, will be forfeited when you purchase a subscription

Consumable Token Packs

• Token packs ($0.99 to $49.99) provide a set number of AI generation credits
• Tokens do not expire and are non-refundable
• Tokens are consumed one per AI room generation
• Token balances are tied to your account and cannot be transferred

All prices are in USD and may vary by region. Prices are subject to change, but changes will not affect active subscription periods.`,
  },
  {
    title: '6. AI-Generated Content',
    body: `HomeGenie uses third-party AI models — including models hosted by Replicate, Inc. and Black Forest Labs — to generate room design imagery based on your photos and text prompts.

By using the AI generation feature, you acknowledge and agree that:

• AI-generated images are for personal inspiration and reference purposes only
• Results are creative and interpretive — they may not match your exact description
• Generated images do not constitute professional interior design, architectural, or structural advice
• You should not rely on AI-generated designs for construction, renovation, or safety-critical decisions
• You grant HomeGenie a limited, non-exclusive license to process your uploaded photos and prompts solely to deliver the AI generation service and to save completed designs to your account
• We may use anonymized, non-identifiable usage data (such as prompt categories and generation counts) to improve our service, but we will not use your personal photos or specific prompts for AI model training without your explicit opt-in consent

Ownership: You retain ownership of your original room photos. AI-generated designs are provided to you for personal use. Because AI-generated content may not be eligible for copyright protection in all jurisdictions, we do not claim ownership of and make no guarantee regarding the copyrightability of AI-generated images.`,
  },
  {
    title: '7. Push Notifications',
    body: `With your permission, HomeGenie may send push notifications to your device regarding:

• AI generation status updates (when your design is ready)
• New likes, follows, and reactions on your content
• Order-related updates
• Promotional offers and design tips (opt-in only)

You can manage notification preferences within the App (Profile → Settings → Notifications) or through your device's system settings at any time. Disabling notifications does not affect your ability to use the App.`,
  },

  // ═══ MIDDLE — Dense compliance ═══
  {
    title: '8. User-Generated Content',
    body: `When you post, upload, share, or publicly display content on HomeGenie — including design posts, profile information, prompts, comments, and any other materials — you grant HomeGenie a worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, reproduce, display, distribute, and create derivative works of that content solely in connection with operating, promoting, and improving the App.

You represent and warrant that:

• You own or have the necessary rights, licenses, and permissions for all content you submit
• Your content does not infringe upon the intellectual property, privacy, publicity, or other rights of any third party
• Your content does not contain unlawful, defamatory, obscene, harassing, threatening, or otherwise objectionable material
• Your content does not contain malware, viruses, or other harmful code

Content Moderation: We reserve the right — but have no obligation — to review, monitor, edit, or remove any user-generated content that violates these Terms or that we find objectionable, at our sole discretion and without prior notice. Repeated violations may result in account suspension or termination.

You may delete your own content at any time. Upon deletion, we will make commercially reasonable efforts to remove it from our active systems, though cached or archived copies may persist for a limited time.`,
  },
  {
    title: '9. Affiliate Commerce and Third-Party Purchases',
    body: `HomeGenie participates in the Amazon Associates Program and may participate in other affiliate programs (including but not limited to CJ Affiliate and ShareASale). When you tap a product link within the App, you are redirected to the third-party retailer's website or app (e.g., Amazon) where you complete your purchase directly with that retailer.

You acknowledge and agree that:

• HomeGenie earns a small referral commission from qualifying purchases at no additional cost to you
• HomeGenie is not a seller, retailer, or merchant — we do not sell, ship, or fulfill any physical products
• Product prices displayed in the App are approximate and may differ from the live price on the retailer's website — always verify the price before purchasing
• All order fulfillment, shipping, returns, refunds, warranties, and customer service for physical products are handled exclusively by the third-party retailer
• HomeGenie is not responsible or liable for the quality, safety, legality, or availability of any products purchased through affiliate links
• Product listings and availability may change without notice

FTC Disclosure: In accordance with the Federal Trade Commission's Guidelines Concerning the Use of Endorsements and Testimonials in Advertising, HomeGenie discloses that we may earn a commission when you buy through links on this app.`,
  },
  {
    title: '10. Prohibited Conduct',
    body: `You agree not to:

• Use the App for any unlawful purpose or in violation of any applicable law or regulation
• Upload, share, or transmit content that is illegal, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable
• Upload content depicting minors, violence, hate speech, or non-consensual imagery
• Attempt to reverse engineer, decompile, disassemble, or extract the source code of the App
• Use automated tools, bots, scrapers, or any non-human means to access or interact with the App
• Circumvent, disable, or interfere with security features of the App
• Misrepresent your identity, impersonate another person, or create fake accounts
• Use the App to send unsolicited messages, spam, or chain letters
• Exploit AI generation features to create misleading, fraudulent, or deceptive content
• Resell, sublicense, or commercially redistribute AI-generated designs without authorization
• Interfere with or disrupt the integrity or performance of the App or its servers

Violation of these restrictions may result in immediate account suspension or permanent termination, at our sole discretion and without prior notice.`,
  },
  {
    title: '11. Supplier Marketplace',
    body: `HomeGenie allows approved sellers ("Verified Suppliers") to list and sell products through the marketplace. If you apply to become a Verified Supplier, additional terms apply:

• You must submit a complete and truthful supplier application
• Approval is at HomeGenie's sole discretion and may take 3–5 business days
• Approved suppliers must comply with all applicable laws, including consumer protection, product safety, and tax regulations
• HomeGenie reserves the right to revoke supplier status, remove product listings, or suspend supplier accounts for violations of these Terms or marketplace policies
• Product listings must be accurate, not misleading, and must not infringe on third-party intellectual property rights
• HomeGenie is not responsible for disputes between suppliers and buyers`,
  },
  {
    title: '12. Intellectual Property',
    body: `All content, features, and functionality of the App — including but not limited to the HomeGenie name, logo, visual design system, user interface, AI pipeline, product matching algorithms, and underlying codebase — are owned by HomeGenie and are protected by United States and international copyright, trademark, patent, trade secret, and other intellectual property laws.

The HomeGenie name and logo are trademarks of HomeGenie. You may not use our trademarks without our prior written consent.

Nothing in these Terms grants you any right, title, or interest in our intellectual property. You may not copy, reproduce, distribute, modify, create derivative works of, publicly display, or commercially exploit any portion of the App or its content without our express written permission.`,
  },
  {
    title: '13. Disclaimers',
    body: `THE APP IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE FULLEST EXTENT PERMITTED BY LAW, HOMEGENIE DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.

WITHOUT LIMITING THE FOREGOING, HOMEGENIE DOES NOT WARRANT THAT:
• THE APP WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE
• THE RESULTS OBTAINED FROM THE APP (INCLUDING AI-GENERATED DESIGNS) WILL BE ACCURATE, RELIABLE, OR SUITABLE FOR ANY PARTICULAR PURPOSE
• ANY DEFECTS OR ERRORS IN THE APP WILL BE CORRECTED
• THE APP IS FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS

AI-GENERATED DESIGNS ARE PROVIDED FOR INSPIRATIONAL PURPOSES ONLY AND SHOULD NOT BE RELIED UPON FOR CONSTRUCTION, RENOVATION, OR SAFETY DECISIONS.`,
  },
  {
    title: '14. Limitation of Liability',
    body: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL HOMEGENIE, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH:

• YOUR ACCESS TO OR USE OF (OR INABILITY TO ACCESS OR USE) THE APP
• ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE APP
• ANY PRODUCTS PURCHASED THROUGH AFFILIATE LINKS IN THE APP
• UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR CONTENT OR DATA
• ANY AI-GENERATED CONTENT OR DESIGN RECOMMENDATIONS

IN NO EVENT SHALL HOMEGENIE'S TOTAL AGGREGATE LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNTS YOU HAVE PAID TO HOMEGENIE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00 USD).

SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES, SO SOME OF THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU.`,
  },
  {
    title: '15. Indemnification',
    body: `You agree to defend, indemnify, and hold harmless HomeGenie and its officers, directors, employees, contractors, agents, licensors, and suppliers from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to:

• Your violation of these Terms
• Your use of the App
• Your user-generated content
• Your violation of any rights of a third party
• Your violation of any applicable law or regulation`,
  },
  {
    title: '16. Governing Law and Dispute Resolution',
    body: `These Terms shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions.

Any dispute arising from or relating to these Terms or the App shall first be attempted to be resolved through good-faith negotiation. If negotiation fails, the dispute shall be resolved by binding arbitration administered by JAMS under its Streamlined Arbitration Rules, conducted in San Francisco County, California. The arbitrator's decision shall be final and binding.

You agree that any arbitration or proceeding shall be conducted on an individual basis and not as part of a class, consolidated, or representative action.

Notwithstanding the above, either party may seek injunctive or equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement of intellectual property rights.`,
  },
  {
    title: '17. Severability',
    body: `If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, that provision shall be modified to the minimum extent necessary to make it enforceable, or if modification is not possible, it shall be severed from these Terms. The remaining provisions shall continue in full force and effect.`,
  },
  {
    title: '18. Entire Agreement',
    body: `These Terms, together with our Privacy Policy and any other legal notices or policies published by HomeGenie within the App, constitute the entire agreement between you and HomeGenie regarding your use of the App. These Terms supersede all prior agreements, communications, and understandings, whether written or oral, regarding the subject matter herein.`,
  },

  // ═══ BOTTOM — Actionable, user-friendly ═══
  {
    title: '19. Account Deletion',
    body: `You may delete your HomeGenie account at any time from within the App by navigating to Profile → Settings → Delete Account. Upon requesting account deletion:

• Your profile, saved designs, liked content, and personal data will be permanently deleted from our active databases within 30 days
• Any active subscriptions must be canceled separately through your Apple ID settings — deleting your HomeGenie account does not automatically cancel Apple subscriptions
• Token balances are non-refundable and will be forfeited upon account deletion
• Content you have shared publicly may have been copied or re-shared by other users prior to deletion — we cannot control third-party copies
• Certain data may be retained for up to 90 days after deletion for fraud prevention, legal compliance, or dispute resolution, after which it will be permanently purged

You may also request account deletion by emailing info@homegenie.app with the subject line "Account Deletion Request."`,
  },
  {
    title: '20. Contact Us',
    body: `If you have any questions, concerns, or feedback about these Terms of Use, please contact us:

HomeGenie
Email: info@homegenie.app
Website: www.homegenie.app

For legal inquiries, please include "Legal Inquiry" in the subject line of your email.`,
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
        <Text style={styles.lastUpdated}>Last updated: April 6, 2026</Text>

        <Text style={styles.intro}>
          Please read these Terms of Use carefully before using HomeGenie. These terms govern your access to and use of our AI-powered interior design platform, including all features, content, subscriptions, and affiliated services.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 HomeGenie. All rights reserved.</Text>
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
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    letterSpacing: -0.3,
  },

  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

  lastUpdated: {
    fontSize: 12,
    color: '#AAA',
    fontWeight: '500',
    fontFamily: 'KantumruyPro_500Medium',
    marginBottom: 16,
  },
  intro: {
    fontSize: 14,
    fontFamily: 'KantumruyPro_400Regular',
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
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  sectionBody: {
    fontSize: 14,
    color: '#555',
    lineHeight: 23,
    fontWeight: '400',
    fontFamily: 'KantumruyPro_400Regular',
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
    paddingTop: 20,
    marginTop: 8,
    alignItems: 'center',
  },
  footerText: { fontSize: 12, color: '#BBB', fontFamily: 'KantumruyPro_400Regular'},
});
