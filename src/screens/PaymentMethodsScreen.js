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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Line, Rect } from 'react-native-svg';
import LensLoader from '../components/LensLoader';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { colors } from '../constants/colors';

const { width } = Dimensions.get('window');

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function PlusIcon({ color = colors.bluePrimary }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

// EMV chip — gold rectangle with internal contacts
function ChipIcon() {
  return (
    <Svg width={42} height={32} viewBox="0 0 42 32" fill="none">
      <Rect x={0} y={0} width={42} height={32} rx={5} fill="rgba(255,215,0,0.88)" />
      {/* Vertical dividers */}
      <Rect x={13} y={0} width={1.5} height={32} fill="rgba(0,0,0,0.12)" />
      <Rect x={27.5} y={0} width={1.5} height={32} fill="rgba(0,0,0,0.12)" />
      {/* Horizontal dividers */}
      <Rect x={0} y={11} width={42} height={1.5} fill="rgba(0,0,0,0.12)" />
      <Rect x={0} y={19.5} width={42} height={1.5} fill="rgba(0,0,0,0.12)" />
      {/* Center contact pad */}
      <Rect x={14.5} y={11} width={13} height={10} rx={1.5} fill="rgba(0,0,0,0.07)" />
    </Svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function maskCardNumber(last4) {
  return `•••• •••• •••• ${last4}`;
}

const CARD_BRAND_COLORS = {
  visa:       { bg: '#67ACE9', accent: '#fff' },
  mastercard: { bg: '#67ACE9', accent: '#fff' },
  amex:       { bg: '#67ACE9', accent: '#fff' },
  default:    { bg: '#67ACE9', accent: '#fff' },
};

// ── Saved Card Component ───────────────────────────────────────────────────────

function SavedCard({ card, isDefault, onSetDefault, onDelete }) {
  const brand = CARD_BRAND_COLORS[card.brand] || CARD_BRAND_COLORS.default;
  const brandLabel = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);

  return (
    <View style={[styles.savedCard, { backgroundColor: brand.bg }]}>
      {/* Decorative background circles for card depth */}
      <View style={styles.cardCircle1} />
      <View style={styles.cardCircle2} />

      {/* Row 1: Chip + Default badge */}
      <View style={styles.savedCardTop}>
        <ChipIcon />
        {isDefault && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        )}
      </View>

      {/* Row 2: Card number */}
      <Text style={styles.savedCardNumber}>{maskCardNumber(card.last4)}</Text>

      {/* Row 3: Cardholder name */}
      {!!card.name && (
        <View style={styles.savedCardNameRow}>
          <Text style={styles.savedCardNameLabel}>CARDHOLDER NAME</Text>
          <Text style={styles.savedCardNameValue} numberOfLines={1}>{card.name.toUpperCase()}</Text>
        </View>
      )}

      {/* Row 4: Expiry + Brand + Actions */}
      <View style={styles.savedCardBottom}>
        <View>
          <Text style={styles.savedCardExpLabel}>EXPIRES</Text>
          <Text style={styles.savedCardExpValue}>{card.expiry}</Text>
        </View>
        <View style={styles.savedCardBottomRight}>
          <Text style={styles.savedCardBrandLabel}>{brandLabel.toUpperCase()}</Text>
          <View style={styles.savedCardActions}>
            {!isDefault && (
              <TouchableOpacity
                style={styles.savedCardActionBtn}
                onPress={onSetDefault}
                activeOpacity={0.75}
              >
                <Text style={styles.savedCardActionText}>Set Default</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.savedCardActionBtn, styles.savedCardDeleteBtn]}
              onPress={onDelete}
              activeOpacity={0.75}
            >
              <TrashIcon />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Add Card Form (Stripe CardField — PCI-compliant) ──────────────────────────

function AddCardForm({ onSave, onCancel }) {
  const { createPaymentMethod } = useStripe();
  const [cardName, setCardName] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!cardName.trim()) {
      Alert.alert('Missing Name', 'Please enter the cardholder name.');
      return;
    }
    if (!cardComplete) {
      Alert.alert('Incomplete Card', 'Please complete your card details.');
      return;
    }
    setSaving(true);
    try {
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: { billingDetails: { name: cardName.trim() } },
      });
      if (error) {
        Alert.alert('Card Error', error.message);
        return;
      }
      onSave({
        paymentMethodId: paymentMethod.id,
        last4: paymentMethod.card.last4,
        brand: paymentMethod.card.brand?.toLowerCase() ?? 'default',
        expiry: `${String(paymentMethod.card.expMonth).padStart(2, '0')}/${String(paymentMethod.card.expYear).slice(-2)}`,
        name: cardName.trim(),
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCardForm}>
      <Text style={styles.addCardTitle}>New Card</Text>

      <Text style={styles.fieldLabel}>Cardholder Name</Text>
      <TextInput
        style={styles.input}
        value={cardName}
        onChangeText={setCardName}
        placeholder="Full name on card"
        placeholderTextColor="#BBBBC0"
        autoCapitalize="words"
      />

      <Text style={styles.fieldLabel}>Card Details</Text>
      <CardField
        postalCodeEnabled={false}
        onCardChange={(details) => setCardComplete(details.complete)}
        style={styles.stripeCardField}
        cardStyle={{
          backgroundColor: '#FAFAFA',
          textColor: '#111',
          borderColor: '#EBEBEB',
          borderWidth: 1.5,
          borderRadius: 12,
          fontSize: 15,
          placeholderColor: '#BBBBC0',
        }}
      />

      <View style={styles.addCardBtns}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7} disabled={saving}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.saveCardBtn, saving && { opacity: 0.7 }]} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
          {saving ? (
            <LensLoader size={20} color="#fff" light="#fff" />
          ) : (
            <Text style={styles.saveCardBtnText}>Save Card</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function PaymentMethodsScreen({ navigation }) {
  const [savedCards, setSavedCards] = useState([
    { id: '1', last4: '4242', brand: 'visa', expiry: '12/27', name: 'SnapSpace User' },
  ]);
  const [defaultCardId, setDefaultCardId] = useState('1');
  const [showAddCard, setShowAddCard] = useState(false);

  const handleAddCard = (card) => {
    const newCard = { ...card, id: Date.now().toString() };
    setSavedCards((prev) => [...prev, newCard]);
    if (savedCards.length === 0) setDefaultCardId(newCard.id);
    setShowAddCard(false);
  };

  const handleDeleteCard = (id) => {
    Alert.alert('Remove Card', 'Are you sure you want to remove this card?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setSavedCards((prev) => {
            const remaining = prev.filter((c) => c.id !== id);
            setDefaultCardId((currentDefault) => {
              if (currentDefault === id) {
                return remaining.length > 0 ? remaining[0].id : null;
              }
              return currentDefault;
            });
            return remaining;
          });
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Methods</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Saved Cards</Text>

        {savedCards.map((card) => (
          <SavedCard
            key={card.id}
            card={card}
            isDefault={card.id === defaultCardId}
            onSetDefault={() => setDefaultCardId(card.id)}
            onDelete={() => handleDeleteCard(card.id)}
          />
        ))}

        {!showAddCard ? (
          <TouchableOpacity
            style={styles.addCardTrigger}
            onPress={() => setShowAddCard(true)}
            activeOpacity={0.7}
          >
            <PlusIcon />
            <Text style={styles.addCardTriggerText}>Add New Card</Text>
          </TouchableOpacity>
        ) : (
          <AddCardForm
            onSave={handleAddCard}
            onCancel={() => setShowAddCard(false)}
          />
        )}

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

  // Header
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
    paddingTop: 24,
  },

  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A0A0A8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
  },

  // Saved card
  savedCard: {
    borderRadius: 18,
    padding: 22,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
    minHeight: 190,
  },
  // Decorative background circles
  cardCircle1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardCircle2: {
    position: 'absolute',
    bottom: -60,
    right: 40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  savedCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  defaultBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  defaultBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  savedCardNumber: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 3,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  savedCardNameRow: {
    marginBottom: 16,
  },
  savedCardNameLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  savedCardNameValue: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  savedCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  savedCardExpLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  savedCardExpValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  savedCardBottomRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  savedCardBrandLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.5,
    fontStyle: 'italic',
  },
  savedCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savedCardActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  savedCardDeleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  savedCardActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Add card trigger
  addCardTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 4,
  },
  addCardTriggerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.bluePrimary,
  },

  // Add card form
  addCardForm: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  addCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  stripeCardField: {
    width: '100%',
    height: 50,
    marginTop: 4,
  },
  addCardBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  cancelBtnText: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
  saveCardBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.bluePrimary,
  },
  saveCardBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Add card form inputs
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.3,
    marginBottom: 6,
    marginTop: 12,
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
});
