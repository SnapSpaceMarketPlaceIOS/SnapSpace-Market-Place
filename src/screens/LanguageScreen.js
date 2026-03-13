import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_LANG = '@snapspace_language';

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en',    name: 'English',               native: 'English',               region: 'United States' },
  { code: 'es',    name: 'Spanish',               native: 'Español',               region: 'España / Latinoamérica' },
  { code: 'fr',    name: 'French',                native: 'Français',              region: 'France' },
  { code: 'de',    name: 'German',                native: 'Deutsch',               region: 'Deutschland' },
  { code: 'it',    name: 'Italian',               native: 'Italiano',              region: 'Italia' },
  { code: 'pt',    name: 'Portuguese',            native: 'Português',             region: 'Brasil / Portugal' },
  { code: 'zh',    name: 'Chinese (Simplified)',  native: '简体中文',                region: '中国' },
  { code: 'zh-tw', name: 'Chinese (Traditional)', native: '繁體中文',                region: '台灣 / 香港' },
  { code: 'ja',    name: 'Japanese',              native: '日本語',                 region: '日本' },
  { code: 'ko',    name: 'Korean',                native: '한국어',                 region: '대한민국' },
  { code: 'ar',    name: 'Arabic',                native: 'العربية',               region: 'العالم العربي' },
  { code: 'hi',    name: 'Hindi',                 native: 'हिन्दी',                region: 'भारत' },
  { code: 'ru',    name: 'Russian',               native: 'Русский',               region: 'Россия' },
  { code: 'nl',    name: 'Dutch',                 native: 'Nederlands',            region: 'Nederland' },
  { code: 'pl',    name: 'Polish',                native: 'Polski',                region: 'Polska' },
  { code: 'tr',    name: 'Turkish',               native: 'Türkçe',                region: 'Türkiye' },
  { code: 'sv',    name: 'Swedish',               native: 'Svenska',               region: 'Sverige' },
  { code: 'da',    name: 'Danish',                native: 'Dansk',                 region: 'Danmark' },
  { code: 'no',    name: 'Norwegian',             native: 'Norsk',                 region: 'Norge' },
  { code: 'fi',    name: 'Finnish',               native: 'Suomi',                 region: 'Suomi' },
];

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function LanguageScreen({ navigation }) {
  const [selected, setSelected] = useState('en');
  const [search, setSearch] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_LANG)
      .then((val) => { if (val) setSelected(val); })
      .catch(() => {});
  }, []);

  const filtered = search.trim()
    ? LANGUAGES.filter(
        (l) =>
          l.name.toLowerCase().includes(search.toLowerCase()) ||
          l.native.toLowerCase().includes(search.toLowerCase()) ||
          l.region.toLowerCase().includes(search.toLowerCase())
      )
    : LANGUAGES;

  const handleSelect = (code) => {
    setSelected(code);
    AsyncStorage.setItem(STORAGE_KEY_LANG, code).catch(() => {});
    const lang = LANGUAGES.find((l) => l.code === code);
    Alert.alert(
      'Language Updated',
      `App language set to ${lang.name}. Some changes may require a restart.`,
      [{ text: 'OK' }]
    );
  };

  const selectedLang = LANGUAGES.find((l) => l.code === selected);

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
          <Text style={styles.headerTitle}>Language</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Current language banner */}
        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>CURRENT LANGUAGE</Text>
          <Text style={styles.currentName}>{selectedLang.name}</Text>
          <Text style={styles.currentNative}>{selectedLang.native}</Text>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <SearchIcon />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search languages..."
            placeholderTextColor="#BBB"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Language list */}
        <Text style={styles.sectionLabel}>
          {search.trim() ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'ALL LANGUAGES'}
        </Text>

        <View style={styles.card}>
          {filtered.map((lang, i) => {
            const isSelected = lang.code === selected;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.row, i < filtered.length - 1 && styles.rowBorder, isSelected && styles.rowSelected]}
                onPress={() => handleSelect(lang.code)}
                activeOpacity={0.7}
              >
                <View style={styles.rowContent}>
                  <Text style={[styles.rowName, isSelected && styles.rowNameSelected]}>
                    {lang.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {lang.native}  ·  {lang.region}
                  </Text>
                </View>
                {isSelected && <CheckIcon />}
              </TouchableOpacity>
            );
          })}
          {filtered.length === 0 && (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>No languages found for "{search}"</Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>
          Changing the language affects the app interface. Content created by other users will remain in their original language.
        </Text>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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

  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Current language card
  currentCard: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.bluePrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  currentLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  currentName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  currentNative: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111' },
  clearBtn: { fontSize: 13, color: '#AAA', fontWeight: '600' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A0A0A8',
    letterSpacing: 1,
    marginBottom: 10,
  },

  // Language list
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F4F4F6' },
  rowSelected: { backgroundColor: '#F5F9FF' },
  rowContent: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 2 },
  rowNameSelected: { color: colors.bluePrimary },
  rowMeta: { fontSize: 12, color: '#999' },

  noResults: { paddingVertical: 28, alignItems: 'center' },
  noResultsText: { fontSize: 14, color: '#AAA' },

  footer: {
    fontSize: 12,
    color: '#AAAAAA',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
