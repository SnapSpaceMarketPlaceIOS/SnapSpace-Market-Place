import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Linking,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';

const { width } = Dimensions.get('window');

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function ChevronDownIcon({ rotated }) {
  return (
    <Svg
      width={18} height={18} viewBox="0 0 24 24" fill="none"
      stroke="#999" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      style={rotated ? { transform: [{ rotate: '180deg' }] } : {}}
    >
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}


// ── FAQ Data ───────────────────────────────────────────────────────────────────

const FAQ_SECTIONS = [
  {
    title: 'Getting Started',
    items: [
      {
        q: 'What is HomeGenie?',
        a: 'HomeGenie is an AI-powered interior design marketplace. Take a photo of any room, describe your style, and our AI instantly redesigns it with real furniture and decor from our curated catalog — all shoppable in one tap.',
      },
      {
        q: 'How do I generate a room design?',
        a: 'Tap the Snap tab (the camera icon with the blue sparkle) in the center of the tab bar. Take a photo or upload one from your gallery, write a style prompt — for example "Japandi bedroom with warm wood tones and soft lighting" — then tap Generate. Your AI redesign appears in seconds with matched products.',
      },
      {
        q: 'What kind of rooms can I redesign?',
        a: 'Any indoor space works: living rooms, bedrooms, kitchens, dining rooms, home offices, bathrooms, nurseries, and more. The AI performs best with well-lit, clear photos where the room boundaries are visible.',
      },
      {
        q: 'Is HomeGenie free to use?',
        a: 'Browsing designs, exploring the catalog, liking, and saving is completely free. AI room generation uses credits — free accounts include a set number of generations. Additional generations are available through token packs.',
      },
    ],
  },
  {
    title: 'Shopping & Products',
    items: [
      {
        q: 'How does shopping work in HomeGenie?',
        a: 'HomeGenie surfaces matching furniture and decor products alongside every AI design. All products are affiliate-linked — tapping "Buy on Amazon" opens Amazon\'s app or website where you complete your purchase directly. HomeGenie earns a small referral commission at no extra cost to you.',
      },
      {
        q: 'How do I add items to my cart?',
        a: 'Tap any product card to open its detail page, then tap "Add to Cart." You can also tap "Shop The Look" on any design to see and cart all matched products at once. Your cart saves items as you browse.',
      },
      {
        q: 'What does "We may earn a commission" mean?',
        a: 'HomeGenie participates in the Amazon Associates affiliate program. When you purchase a product through a link in our app, we earn a small commission from Amazon. The price you pay is always identical to Amazon\'s listed price — there is no markup from HomeGenie.',
      },
      {
        q: 'Why do some product prices say "Price may vary"?',
        a: 'Amazon product prices change frequently. We display the price at the time we last synced our catalog, but the live price on Amazon may differ. Always check Amazon\'s product page for the current price before purchasing.',
      },
    ],
  },
  {
    title: 'AI & Designs',
    items: [
      {
        q: 'How do I write a better prompt?',
        a: 'The best prompts include four things: room type, design style, color palette, and mood. Example: "Scandinavian living room with white oak furniture, cream and sage tones, cozy and minimal feel." Vague prompts like "nice room" give unpredictable results — the more specific you are, the better the output.',
      },
      {
        q: 'Why does my AI result look different from what I described?',
        a: 'AI generation is creative and interpretive by nature. If the result misses the mark, try being more specific with your style name (e.g. "Wabi-Sabi" instead of "Japanese"), mention specific materials like "linen", "rattan", or "marble", and describe the lighting feel ("warm ambient" vs "bright and airy").',
      },
      {
        q: 'Where do my generated designs get saved?',
        a: 'Every design you generate is automatically saved to My Spaces — accessible from Profile → gear icon → My Spaces. Each saved space shows your photo, your prompt, and the matched products.',
      },
      {
        q: 'Can I like and save designs from the feed?',
        a: 'Yes. Tap the heart icon on any design card in Home or Explore to like it. All liked designs are accessible from the Liked tab on your Profile page.',
      },
      {
        q: 'How do I share a design?',
        a: 'Tap the share icon on any design card or room result. You can share via Messages, Instagram, AirDrop, or any app on your device.',
      },
    ],
  },
  {
    title: 'Account & Profile',
    items: [
      {
        q: 'How do I edit my profile?',
        a: 'From the Profile tab, tap "Edit Profile" to update your display name, username, bio, and profile photo.',
      },
      {
        q: 'How do I follow other users?',
        a: 'Tap any username or profile photo anywhere in the app to visit their profile, then tap "Follow." Your follower and following counts are displayed on your own profile.',
      },
      {
        q: 'How do I manage my saved payment methods?',
        a: 'Go to Profile → tap the gear icon → Payment Methods. You can add new cards and set a default for future use.',
      },
      {
        q: 'How do I become a Verified Supplier?',
        a: 'Go to Profile → tap the gear icon → Become a Supplier. Fill out the application form with your business details and our team will review it within 3–5 business days.',
      },
    ],
  },
  {
    title: 'Contact & Support',
    items: [
      {
        q: 'How do I contact the HomeGenie team?',
        a: 'Email us at info@homegenie.app. Our team typically responds within 1–2 business days. For the fastest response, include your device model and a brief description of your issue.',
      },
      {
        q: 'How do I request a new feature?',
        a: 'Go to Profile → tap the gear icon → Request a Feature. Tell us what you\'d love to see in HomeGenie and we\'ll consider it for a future update. We read every submission.',
      },
      {
        q: 'How do I report a bug?',
        a: 'Email info@homegenie.app with a description of what happened, your device model (e.g. iPhone 15 Pro), your iOS version, and a screenshot if possible. This helps us reproduce and fix it quickly.',
      },
    ],
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function FAQItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.faqItem}>
      <TouchableOpacity
        style={styles.faqQuestion}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.faqQuestionText}>{item.q}</Text>
        <ChevronDownIcon rotated={open} />
      </TouchableOpacity>
      {open && (
        <View style={styles.faqAnswer}>
          <Text style={styles.faqAnswerText}>{item.a}</Text>
        </View>
      )}
    </View>
  );
}

function FAQSection({ section, isLast }) {
  return (
    <View style={[styles.faqSection, isLast && { marginBottom: 0 }]}>
      <Text style={styles.faqSectionTitle}>{section.title}</Text>
      <View style={styles.faqCard}>
        {section.items.map((item, i) => (
          <View key={i}>
            <FAQItem item={item} />
            {i < section.items.length - 1 && <View style={styles.faqDivider} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HelpScreen({ navigation }) {
  const [search, setSearch] = useState('');

  const filteredSections = search.trim()
    ? FAQ_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.q.toLowerCase().includes(search.toLowerCase()) ||
            item.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((section) => section.items.length > 0)
    : FAQ_SECTIONS;

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
          <Text style={styles.headerTitle}>Help & Support</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSubtitle}>Search our FAQ or reach out to the team.</Text>

          {/* Search bar */}
          <View style={styles.searchBar}>
            <SearchIcon />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search questions..."
              placeholderTextColor="#BBB"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* FAQ */}
        <Text style={styles.faqHeader}>
          {search.trim() ? `Results for "${search}"` : 'Frequently Asked Questions'}
        </Text>

        {filteredSections.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>No results found for "{search}"</Text>
            <Text style={styles.noResultsSub}>Try different keywords or contact support.</Text>
          </View>
        ) : (
          filteredSections.map((section, i) => (
            <FAQSection
              key={section.title}
              section={section}
              isLast={i === filteredSections.length - 1}
            />
          ))
        )}

        {/* Contact card */}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactSubtitle}>Our team is here for you. Send us an email and we'll get back to you within 1–2 business days.</Text>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('mailto:info@homegenie.app?subject=HomeGenie Support')}
            activeOpacity={0.85}
          >
            <Text style={styles.contactBtnText}>Email Support</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

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

  scrollContent: {
    paddingBottom: 20,
  },

  // Hero
  hero: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#67ACE9',
    marginBottom: 18,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#111',
  },
  clearBtn: {
    fontSize: 13,
    color: '#AAA',
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
  },

  // FAQ header
  faqHeader: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#A0A0A8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 14,
  },

  // FAQ sections
  faqSection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  faqSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  faqItem: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
    color: '#111',
    lineHeight: 20,
  },
  faqAnswer: {
    paddingBottom: 14,
  },
  faqAnswerText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 21,
    fontWeight: '400',
    fontFamily: 'KantumruyPro_400Regular',
  },
  faqDivider: {
    height: 1,
    backgroundColor: '#F4F4F6',
    marginHorizontal: 16,
  },

  // Contact card
  contactCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#F0F6FF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    marginBottom: 8,
  },
  contactSubtitle: {
    fontSize: 13,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  contactBtn: {
    backgroundColor: '#0B6DC3',
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  contactBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
  },

  // No results
  noResults: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  noResultsText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
    color: '#555',
    textAlign: 'center',
    marginBottom: 8,
  },
  noResultsSub: {
    fontSize: 13,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#999',
    textAlign: 'center',
  },
});
