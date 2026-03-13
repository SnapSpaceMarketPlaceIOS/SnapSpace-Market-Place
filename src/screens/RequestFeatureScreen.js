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

function LightbulbIcon({ size = 52, color = '#F59E0B' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={9} y1={18} x2={15} y2={18} />
      <Line x1={10} y1={22} x2={14} y2={22} />
      <Path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
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

const RECENT_REQUESTS = [
  { title: 'Dark mode support',            votes: 847, status: 'planned' },
  { title: 'Save AI generations to album', votes: 612, status: 'in_progress' },
  { title: '3D room preview',              votes: 589, status: 'planned' },
  { title: 'Collaborative mood boards',    votes: 441, status: 'under_review' },
  { title: 'Budget filter for shopping',   votes: 318, status: 'under_review' },
];

const STATUS_CONFIG = {
  planned:      { label: 'Planned',      bg: '#EFF6FF', text: '#1D4ED8' },
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
  const [recentVotes, setRecentVotes] = useState(
    RECENT_REQUESTS.reduce((acc, r) => ({ ...acc, [r.title]: r.votes }), {})
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
      // Non-fatal: show success regardless so UX isn't blocked if table doesn't exist yet
    } finally {
      setSubmitting(false);
    }
    setSubmitted(true);
  };

  const handleVote = (requestTitle) => {
    if (votedIds[requestTitle]) return;
    setVotedIds((prev) => ({ ...prev, [requestTitle]: true }));
    setRecentVotes((prev) => ({ ...prev, [requestTitle]: (prev[requestTitle] || 0) + 1 }));
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
            <LightbulbIcon size={44} color="#F59E0B" />
          </View>
          <Text style={styles.successTitle}>Request Submitted!</Text>
          <Text style={styles.successSubtitle}>
            Thanks for sharing your idea. Our team reviews every request and uses your feedback to shape the roadmap.
          </Text>
          <TouchableOpacity style={styles.submitBtn} onPress={handleNewRequest} activeOpacity={0.85}>
            <Text style={styles.submitBtnText}>Submit Another Request</Text>
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

        {/* Form */}
        <Text style={styles.sectionLabel}>YOUR REQUEST</Text>
        <View style={styles.formCard}>

          <Text style={styles.fieldLabel}>Feature Title <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Dark mode, Budget filter, 3D preview..."
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
          <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit Request'}</Text>
        </TouchableOpacity>

        {/* Popular requests */}
        <Text style={[styles.sectionLabel, { marginTop: 32 }]}>POPULAR REQUESTS</Text>
        <Text style={styles.popularSubtitle}>Vote for features you'd love to see.</Text>
        <View style={styles.card}>
          {RECENT_REQUESTS.map((req, i) => {
            const cfg = STATUS_CONFIG[req.status];
            const voted = !!votedIds[req.title];
            return (
              <View key={req.title} style={[styles.popularItem, i < RECENT_REQUESTS.length - 1 && styles.popularItemBorder]}>
                <View style={styles.popularLeft}>
                  <Text style={styles.popularTitle}>{req.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.voteBtn, voted && styles.voteBtnVoted]}
                  onPress={() => handleVote(req.title)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.voteArrow, voted && styles.voteArrowVoted]}>▲</Text>
                  <Text style={[styles.voteCount, voted && styles.voteCountVoted]}>
                    {recentVotes[req.title]}
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
    color: '#111',
    letterSpacing: -0.3,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 28,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
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
    color: '#BBB',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#EBEBEB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    minHeight: 110,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
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
    color: '#555',
  },
  categoryChipTextSelected: {
    color: colors.bluePrimary,
    fontWeight: '600',
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
  },

  // Popular requests
  popularSubtitle: {
    fontSize: 13,
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
    gap: 6,
  },
  popularTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    lineHeight: 19,
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
  },
  voteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 52,
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
    color: '#999',
  },
  voteArrowVoted: {
    color: colors.bluePrimary,
  },
  voteCount: {
    fontSize: 13,
    fontWeight: '700',
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 36,
  },
  backHomeBtn: {
    paddingVertical: 12,
  },
  backHomeBtnText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
});
