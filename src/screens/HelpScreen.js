import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
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
        q: 'What is SnapSpace?',
        a: 'SnapSpace is an AI-powered interior design app. Snap a photo of any room and our AI instantly redesigns it with curated furniture and decor you can shop directly.',
      },
      {
        q: 'How do I generate a room design?',
        a: 'Tap the camera icon (Snap) in the center of the tab bar. Point your camera at any room, enter a style prompt like "Modern minimalist with warm tones", then tap "Generate with AI". Your redesigned room appears in seconds.',
      },
      {
        q: 'Is SnapSpace free to use?',
        a: 'Browsing and exploring designs is completely free. AI room generation may have usage limits on the free tier. Premium features and unlimited generations are available with a subscription.',
      },
    ],
  },
  {
    title: 'Orders & Shopping',
    items: [
      {
        q: 'How do I add items to my cart?',
        a: 'Tap any product in a design post or room result to open its detail page, then tap "Add to Cart". You can also tap "Shop The Look" to see and add all items from a design at once.',
      },
      {
        q: 'Where can I see my past orders?',
        a: 'Go to Profile → tap the gear icon → Order History. Every completed purchase is listed there with item details, status, and total breakdown.',
      },
      {
        q: 'How do I track my order status?',
        a: 'Open Order History from your profile settings. Each order displays a status badge: Confirmed, Processing, Shipped, or Delivered. Tap any order to expand the full details.',
      },
      {
        q: 'Can I cancel or return an order?',
        a: 'Orders can be cancelled within 1 hour of placement by contacting support. Returns are accepted within 30 days of delivery for most items. Reach out to our support team via email for assistance.',
      },
    ],
  },
  {
    title: 'Account & Settings',
    items: [
      {
        q: 'How do I update my payment method?',
        a: 'Go to Profile → tap the gear icon → Payment Methods. There you can add new cards, set a default payment method, and update your shipping and billing address.',
      },
      {
        q: 'How do I edit my profile?',
        a: 'From the Profile tab, tap "Edit Profile" to change your display name, username, bio, profile photo, and banner image.',
      },
      {
        q: 'How do I change my shipping address?',
        a: 'Go to Profile → gear icon → Payment Methods → scroll to the Shipping Address section. Fill in your details and tap "Save Changes".',
      },
    ],
  },
  {
    title: 'AI & Designs',
    items: [
      {
        q: 'Why does my AI result look different from what I described?',
        a: 'AI generation works best with specific, descriptive prompts. Try including style ("Scandinavian", "mid-century modern"), colors ("warm neutrals", "deep blues"), and mood ("cozy", "airy and minimal"). More detail = better results.',
      },
      {
        q: 'Can I save designs I like?',
        a: 'Yes! Tap the heart icon on any design card to like and save it. View all your saved designs in Profile → Liked, or from your settings under Saved Designs.',
      },
      {
        q: 'How do I share a design with someone?',
        a: 'Tap the share icon on any design card. You can share via Messages, AirDrop, or any app on your device. Shared designs also appear in your Profile under the Shared tab.',
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
    color: '#111',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#888',
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
    color: '#111',
  },
  clearBtn: {
    fontSize: 13,
    color: '#AAA',
    fontWeight: '600',
  },

  // FAQ header
  faqHeader: {
    fontSize: 13,
    fontWeight: '700',
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
  },
  faqDivider: {
    height: 1,
    backgroundColor: '#F4F4F6',
    marginHorizontal: 16,
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
    color: '#555',
    textAlign: 'center',
    marginBottom: 8,
  },
  noResultsSub: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
});
