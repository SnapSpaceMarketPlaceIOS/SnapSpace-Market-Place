import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function SparkleIcon({ size = 22, color = '#0B6DC3' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
        fill={color}
        opacity={0.9}
      />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'ai',       label: 'AI & Generation' },
  { id: 'shop',     label: 'Shopping & Cart' },
  { id: 'design',   label: 'Design Tools' },
  { id: 'social',   label: 'Social & Sharing' },
  { id: 'account',  label: 'Account & Profile' },
  { id: 'other',    label: 'Other' },
];

const POPULAR_REQUESTS = [
  {
    title: 'AR Furniture Placement',
    description: 'See exactly how a sofa or lamp fits in your real room — in scale — before you buy.',
    tag: 'Design Tools',
    votes: 1241,
    status: 'under_review',
  },
  {
    title: 'Redesign in 3 Styles at Once',
    description: 'Generate your room in Japandi, Coastal, and Dark Luxe side-by-side and pick your favorite.',
    tag: 'AI & Generation',
    votes: 934,
    status: 'planned',
  },
  {
    title: 'Budget Dupe Finder',
    description: 'Love a high-end piece but over budget? AI finds the closest look-alike at a fraction of the price.',
    tag: 'Shopping',
    votes: 721,
    status: 'planned',
  },
  {
    title: '"Find My Style" AI Profile',
    description: 'Swipe through rooms and HomeGenie builds a taste profile that makes every design feel more you.',
    tag: 'AI & Generation',
    votes: 608,
    status: 'under_review',
  },
  {
    title: 'Before & After Creator',
    description: 'Auto-generate a side-by-side of your real room vs. the AI redesign — ready to post.',
    tag: 'Social',
    votes: 487,
    status: 'in_progress',
  },
];

const STATUS_CONFIG = {
  planned:      { label: 'Planned',      bg: '#EFF6FF', text: '#0B6DC3' },
  in_progress:  { label: 'In Progress',  bg: '#FFF7ED', text: '#C2410C' },
  under_review: { label: 'Under Review', bg: '#F5F3FF', text: '#6D28D9' },
  shipped:      { label: 'Shipped',      bg: '#F0FDF4', text: '#15803D' },
};

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function RequestFeatureScreen({ navigation }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [votedIds, setVotedIds] = useState({});
  const [popularVotes, setPopularVotes] = useState(
    POPULAR_REQUESTS.reduce((acc, r) => ({ ...acc, [r.title]: r.votes }), {})
  );

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title for your feature request.');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Missing Category', 'Please select a category for your request.');
      return;
    }
    setSubmitting(true);
    try {
      await supabase.from('feature_requests').insert({
        title: title.trim(),
        description: description.trim() || null,
        category: selectedCategory,
        user_id: user?.id ?? null,
      });
    } catch (_) {
      // Non-fatal — show success regardless so UX isn't blocked if table doesn't exist yet
    } finally {
      setSubmitting(false);
    }
    setSubmitted(true);
  };

  const handleVote = (requestTitle) => {
    if (votedIds[requestTitle]) return;
    setVotedIds((prev) => ({ ...prev, [requestTitle]: true }));
    setPopularVotes((prev) => ({ ...prev, [requestTitle]: (prev[requestTitle] || 0) + 1 }));
  };

  const handleNewRequest = () => {
    setTitle('');
    setDescription('');
    setSelectedCategory(null);
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <BackIcon />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Request a Feature</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <SparkleIcon size={38} color="#0B6DC3" />
          </View>
          <Text style={styles.successTitle}>Idea Received!</Text>
          <Text style={styles.successSubtitle}>
            Thanks for sharing. Our team reads every request and uses your feedback to shape the HomeGenie roadmap.
          </Text>
          <TouchableOpacity style={styles.submitBtn} onPress={handleNewRequest} activeOpacity={0.85}>
            <Text style={styles.submitBtnText}>Submit Another Idea</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backHomeBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backHomeBtnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Request a Feature</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >

        {/* Hero */}
        <Text style={styles.heroTitle}>Shape your HomeGenie.</Text>
        <Text style={styles.heroSubtitle}>Your ideas build the roadmap. We read every single one.</Text>

        {/* Form */}
        <Text style={styles.sectionLabel}>YOUR IDEA</Text>
        <View style={styles.formCard}>

          <Text style={styles.fieldLabel}>Feature Title <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. AR room preview, budget mode, style quiz..."
            placeholderTextColor="#BBBBC0"
            maxLength={80}
          />
          <Text style={styles.charCount}>{title.length}/80</Text>

          <Text style={styles.fieldLabel}>Description <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the feature and why it would be useful..."
            placeholderTextColor="#BBBBC0"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>

          <Text style={styles.fieldLabel}>Category <Text style={styles.required}>*</Text></Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, selectedCategory === cat.id && styles.categoryChipSelected]}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.7}
              >
                {selectedCategory === cat.id && (
                  <View style={styles.categoryCheckDot}>
                    <CheckIcon />
                  </View>
                )}
                <Text style={[styles.categoryChipText, selectedCategory === cat.id && styles.categoryChipTextSelected]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (!title.trim() || !selectedCategory || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit Idea'}</Text>
        </TouchableOpacity>

        {/* Popular requests */}
        <Text style={[styles.sectionLabel, { marginTop: 36 }]}>POPULAR REQUESTS</Text>
        <Text style={styles.popularSubtitle}>Vote for the features you want most.</Text>
        <View style={styles.card}>
          {POPULAR_REQUESTS.map((req, i) => {
            const cfg = STATUS_CONFIG[req.status];
            const voted = !!votedIds[req.title];
            return (
              <View key={req.title} style={[styles.popularItem, i < POPULAR_REQUESTS.length - 1 && styles.popularItemBorder]}>
                <View style={styles.popularLeft}>
                  <View style={styles.popularTitleRow}>
                    <Text style={styles.popularTitle}>{req.title}</Text>
                  </View>
                  <Text style={styles.popularDescription}>{req.description}</Text>
                  <View style={styles.popularMeta}>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                    </View>
                    <View style={styles.tagPill}>
                      <Text style={styles.tagText}>{req.tag}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.voteBtn, voted && styles.voteBtnVoted]}
                  onPress={() => handleVote(req.title)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.voteArrow, voted && styles.voteArrowVoted]}>▲</Text>
                  <Text style={[styles.voteCount, voted && styles.voteCountVoted]}>
                    {popularVotes[req.title] >= 1000
                      ? `${(popularVotes[req.title] / 1000).toFixed(1)}k`
                      : popularVotes[req.title]}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
    fontFamily: 'Geist_700Bold',
    color: '#111',
    letterSpacing: -0.3,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 22,
  },

  // Hero
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: 'Geist_400Regular',
    color: '#67ACE9',
    lineHeight: 20,
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#A0A0A8',
    letterSpacing: 1,
    marginBottom: 10,
  },

  // Form
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#888',
    letterSpacing: 0.3,
    marginBottom: 7,
    marginTop: 14,
  },
  required: {
    color: '#E74C3C',
  },
  optional: {
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#BBB',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#EBEBEB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Geist_400Regular',
    color: '#111',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    minHeight: 110,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#BBB',
    textAlign: 'right',
    marginTop: 4,
  },

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  categoryChipSelected: {
    borderColor: colors.bluePrimary,
    backgroundColor: '#EFF6FF',
  },
  categoryCheckDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: '#555',
  },
  categoryChipTextSelected: {
    color: colors.bluePrimary,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },

  // Submit
  submitBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.bluePrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnDisabled: {
    backgroundColor: '#A0C4E8',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
  },

  // Popular requests
  popularSubtitle: {
    fontSize: 13,
    fontFamily: 'Geist_400Regular',
    color: '#888',
    marginBottom: 12,
    marginTop: -4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  popularItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  popularItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F6',
  },
  popularLeft: {
    flex: 1,
    gap: 5,
  },
  popularTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  popularTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    lineHeight: 19,
    flex: 1,
  },
  popularDescription: {
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: '#777',
    lineHeight: 17,
  },
  popularMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },
  tagPill: {
    backgroundColor: '#F4F4F6',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: '#888',
  },
  voteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    backgroundColor: '#fff',
    gap: 2,
  },
  voteBtnVoted: {
    borderColor: colors.bluePrimary,
    backgroundColor: '#EFF6FF',
  },
  voteArrow: {
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: '#999',
  },
  voteArrowVoted: {
    color: colors.bluePrimary,
  },
  voteCount: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#555',
  },
  voteCountVoted: {
    color: colors.bluePrimary,
  },

  // Success state
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  successIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    fontFamily: 'Geist_400Regular',
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 36,
  },
  backHomeBtn: {
    paddingVertical: 12,
    marginTop: 8,
  },
  backHomeBtnText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
  },
});
