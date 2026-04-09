import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFS = '@snapspace_notif_prefs';
const STORAGE_KEY_PUSH = '@snapspace_notif_push';

// ── Icons — all accept a `color` prop ─────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function BellIcon({ color = '#999' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

function CartBellIcon({ color = '#999' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Line x1={3} y1={6} x2={21} y2={6} />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </Svg>
  );
}

function HeartBellIcon({ color = '#999' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function AIIcon({ color = '#999' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a10 10 0 1 0 10 10" />
      <Path d="M12 8v4l3 3" />
      <Circle cx={18} cy={5} r={3} />
    </Svg>
  );
}

function UserPlusIcon({ color = '#999' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx={8.5} cy={7} r={4} />
      <Line x1={20} y1={8} x2={20} y2={14} />
      <Line x1={23} y1={11} x2={17} y2={11} />
    </Svg>
  );
}

function PromoIcon({ color = '#999' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <Line x1={7} y1={7} x2={7.01} y2={7} />
    </Svg>
  );
}

function EmailIcon({ color = '#999' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <Polyline points="22,6 12,13 2,6" />
    </Svg>
  );
}

// ── Data — store component reference, not rendered JSX ────────────────────────

const NOTIFICATION_SECTIONS = [
  {
    title: 'Activity',
    items: [
      { id: 'orders',     label: 'Order Updates',       desc: 'Shipping, delivery, and order status changes', Icon: CartBellIcon,  default: true  },
      { id: 'likes',      label: 'Likes & Reactions',   desc: 'When someone likes your designs or posts',     Icon: HeartBellIcon, default: true  },
      { id: 'followers',  label: 'New Followers',        desc: 'When someone starts following you',           Icon: UserPlusIcon,  default: true  },
    ],
  },
  {
    title: 'AI & Design',
    items: [
      { id: 'ai_ready',   label: 'AI Generation Ready', desc: 'When your AI room design is finished',         Icon: AIIcon,        default: true  },
      { id: 'ai_tips',    label: 'Design Tips',          desc: 'Personalized prompts and style suggestions',  Icon: BellIcon,      default: false },
    ],
  },
  {
    title: 'Promotions',
    items: [
      { id: 'deals',      label: 'Deals & Offers',      desc: 'Sales and discounts on items in your cart',   Icon: PromoIcon,     default: false },
      { id: 'newsletter', label: 'HomeGenie Newsletter', desc: 'Weekly design inspiration and app updates',   Icon: EmailIcon,     default: false },
    ],
  },
];

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NotificationsScreen({ navigation }) {
  const defaultPrefs = NOTIFICATION_SECTIONS.flatMap((s) => s.items).reduce(
    (acc, item) => ({ ...acc, [item.id]: item.default }),
    {}
  );
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [pushEnabled, setPushEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedPrefs, storedPush] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_PREFS),
          AsyncStorage.getItem(STORAGE_KEY_PUSH),
        ]);
        if (storedPrefs) setPrefs(JSON.parse(storedPrefs));
        if (storedPush !== null) setPushEnabled(JSON.parse(storedPush));
      } catch (_) {}
    })();
  }, []);

  const toggle = (id) => {
    setPrefs((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      AsyncStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const handlePushToggle = (val) => {
    setPushEnabled(val);
    AsyncStorage.setItem(STORAGE_KEY_PUSH, JSON.stringify(val)).catch(() => {});
  };

  const handleSave = () => {
    Alert.alert('Saved', 'Your notification preferences have been updated.');
  };

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
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity onPress={handleSave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.saveBtn}>Save</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Master push toggle */}
        <View style={styles.masterCard}>
          <View style={styles.masterLeft}>
            <View style={styles.masterIconWrap}>
              <BellIcon color={pushEnabled ? colors.bluePrimary : '#BBBBBB'} />
            </View>
            <View>
              <Text style={styles.masterTitle}>Push Notifications</Text>
              <Text style={styles.masterDesc}>Enable all push notifications</Text>
            </View>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={handlePushToggle}
            trackColor={{ false: '#E5E5E5', true: colors.bluePrimary }}
            thumbColor="#fff"
            ios_backgroundColor="#E5E5E5"
          />
        </View>

        {/* Individual toggles */}
        {NOTIFICATION_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
            {section.items.map(({ id, label, desc, Icon }) => {
              const isOn = prefs[id] && pushEnabled;
              const iconColor = isOn ? colors.bluePrimary : '#BBBBBB';
              return (
                <View key={id} style={styles.itemCard}>
                  <View style={styles.rowIconWrap}>
                    <Icon color={iconColor} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={[styles.rowLabel, !pushEnabled && styles.rowLabelDisabled]}>
                      {label}
                    </Text>
                    <Text style={styles.rowDesc} numberOfLines={1} ellipsizeMode="tail">
                      {desc}
                    </Text>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={() => toggle(id)}
                    disabled={!pushEnabled}
                    trackColor={{ false: '#E5E5E5', true: colors.bluePrimary }}
                    thumbColor="#fff"
                    ios_backgroundColor="#E5E5E5"
                  />
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer}>
          You can also manage notifications in your iPhone's Settings app under HomeGenie.
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
    fontFamily: 'Geist_700Bold',
    color: '#111',
    letterSpacing: -0.3,
  },
  saveBtn: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: colors.bluePrimary,
    paddingRight: 4,
  },

  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Master toggle
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  masterLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  masterIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 2, fontFamily: 'Geist_700Bold'},
  masterDesc: { fontSize: 12, color: '#999', fontFamily: 'Geist_400Regular'},

  // Sections
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#A0A0A8',
    letterSpacing: 1,
    marginBottom: 10,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 62,
    gap: 12,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 1, fontFamily: 'Geist_600SemiBold'},
  rowLabelDisabled: { color: '#BBBBBB' },
  rowDesc: { fontSize: 12, color: '#999', lineHeight: 16, fontFamily: 'Geist_400Regular'},

  footer: {
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: '#AAAAAA',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
    marginTop: 4,
  },
});
