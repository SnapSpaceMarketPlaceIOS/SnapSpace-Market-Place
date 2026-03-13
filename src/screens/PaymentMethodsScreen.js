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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Badge, SectionHeader } from '../components/ds';
import Svg, { Path, Circle, Polyline, Line, Rect, G } from 'react-native-svg';
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

function CheckIcon({ color = '#fff', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
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

function CardIcon({ color = '#fff' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={1} y={4} width={22} height={16} rx={2} ry={2} />
      <Line x1={1} y1={10} x2={23} y2={10} />
    </Svg>
  );
}

function LocationIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx={12} cy={10} r={3} />
    </Svg>
  );
}

function UserIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function maskCardNumber(last4) {
  return `•••• •••• •••• ${last4}`;
}

const CARD_BRAND_COLORS = {
  visa:       { bg: '#1A1F71', accent: '#F7B731' },
  mastercard: { bg: '#252525', accent: '#EB001B' },
  amex:       { bg: '#007BC1', accent: '#fff' },
  default:    { bg: '#2C3E50', accent: '#BDC3C7' },
};

// ── Saved Card Component ───────────────────────────────────────────────────────

function SavedCard({ card, isDefault, onSetDefault, onDelete }) {
  const brand = CARD_BRAND_COLORS[card.brand] || CARD_BRAND_COLORS.default;
  const brandLabel = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);

  return (
    <View style={[styles.savedCard, { backgroundColor: brand.bg }]}>
      <View style={styles.savedCardTop}>
        <Text style={[styles.savedCardBrand, { color: '#fff' }]}>{brandLabel}</Text>
        {isDefault && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        )}
      </View>
      <Text style={styles.savedCardNumber}>{maskCardNumber(card.last4)}</Text>
      <View style={styles.savedCardBottom}>
        <View>
          <Text style={styles.savedCardExpLabel}>EXPIRES</Text>
          <Text style={styles.savedCardExpValue}>{card.expiry}</Text>
        </View>
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
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveCardBtnText}>Save Card</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

const INITIAL_ADDRESS = {
  fullName: '',
  street: '',
  apt: '',
  city: '',
  state: '',
  zip: '',
  country: 'United States',
};

const INITIAL_BILLING = {
  fullName: '',
  street: '',
  apt: '',
  city: '',
  state: '',
  zip: '',
  country: 'United States',
};

export default function PaymentMethodsScreen({ navigation }) {
  const [savedCards, setSavedCards] = useState([
    { id: '1', last4: '4242', brand: 'visa', expiry: '12/27', name: 'SnapSpace User' },
  ]);
  const [defaultCardId, setDefaultCardId] = useState('1');
  const [showAddCard, setShowAddCard] = useState(false);

  const [shipping, setShipping] = useState(INITIAL_ADDRESS);
  const [billing, setBilling] = useState(INITIAL_BILLING);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);

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
            // Fix stale closure: update defaultCardId inside the updater callback
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

  const handleSave = () => {
    Alert.alert('Saved', 'Your payment and shipping details have been updated.');
  };

  const updateShipping = (field, value) => {
    setShipping((prev) => ({ ...prev, [field]: value }));
  };

  const updateBilling = (field, value) => {
    setBilling((prev) => ({ ...prev, [field]: value }));
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
          <Text style={styles.headerTitle}>Payment & Shipping</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── PAYMENT METHODS ── */}
        <Text style={styles.sectionTitle}>Payment Methods</Text>

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

        {/* ── SHIPPING ADDRESS ── */}
        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Shipping Address</Text>
        <View style={styles.formCard}>

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={shipping.fullName}
            onChangeText={(t) => updateShipping('fullName', t)}
            placeholder="First and last name"
            placeholderTextColor="#BBBBC0"
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Street Address</Text>
          <TextInput
            style={styles.input}
            value={shipping.street}
            onChangeText={(t) => updateShipping('street', t)}
            placeholder="123 Main St"
            placeholderTextColor="#BBBBC0"
          />

          <Text style={styles.fieldLabel}>Apt / Suite / Unit <Text style={styles.optionalLabel}>(optional)</Text></Text>
          <TextInput
            style={styles.input}
            value={shipping.apt}
            onChangeText={(t) => updateShipping('apt', t)}
            placeholder="Apt 4B"
            placeholderTextColor="#BBBBC0"
          />

          <View style={styles.row}>
            <View style={{ flex: 1.5, marginRight: 10 }}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput
                style={styles.input}
                value={shipping.city}
                onChangeText={(t) => updateShipping('city', t)}
                placeholder="New York"
                placeholderTextColor="#BBBBC0"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>State</Text>
              <TextInput
                style={styles.input}
                value={shipping.state}
                onChangeText={(t) => updateShipping('state', t)}
                placeholder="NY"
                placeholderTextColor="#BBBBC0"
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.fieldLabel}>ZIP Code</Text>
              <TextInput
                style={styles.input}
                value={shipping.zip}
                onChangeText={(t) => updateShipping('zip', t.replace(/\D/g, '').slice(0, 10))}
                placeholder="10001"
                placeholderTextColor="#BBBBC0"
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1.8 }}>
              <Text style={styles.fieldLabel}>Country</Text>
              <TextInput
                style={styles.input}
                value={shipping.country}
                onChangeText={(t) => updateShipping('country', t)}
                placeholder="United States"
                placeholderTextColor="#BBBBC0"
                autoCapitalize="words"
              />
            </View>
          </View>
        </View>

        {/* ── BILLING DETAILS ── */}
        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Billing Details</Text>

        {/* Same as shipping toggle */}
        <TouchableOpacity
          style={styles.sameAsRow}
          onPress={() => setBillingSameAsShipping((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, billingSameAsShipping && styles.checkboxChecked]}>
            {billingSameAsShipping && <CheckIcon size={12} />}
          </View>
          <Text style={styles.sameAsLabel}>Same as shipping address</Text>
        </TouchableOpacity>

        {!billingSameAsShipping && (
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={billing.fullName}
              onChangeText={(t) => updateBilling('fullName', t)}
              placeholder="First and last name"
              placeholderTextColor="#BBBBC0"
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Street Address</Text>
            <TextInput
              style={styles.input}
              value={billing.street}
              onChangeText={(t) => updateBilling('street', t)}
              placeholder="123 Main St"
              placeholderTextColor="#BBBBC0"
            />

            <Text style={styles.fieldLabel}>Apt / Suite / Unit <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              value={billing.apt}
              onChangeText={(t) => updateBilling('apt', t)}
              placeholder="Apt 4B"
              placeholderTextColor="#BBBBC0"
            />

            <View style={styles.row}>
              <View style={{ flex: 1.5, marginRight: 10 }}>
                <Text style={styles.fieldLabel}>City</Text>
                <TextInput
                  style={styles.input}
                  value={billing.city}
                  onChangeText={(t) => updateBilling('city', t)}
                  placeholder="New York"
                  placeholderTextColor="#BBBBC0"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>State</Text>
                <TextInput
                  style={styles.input}
                  value={billing.state}
                  onChangeText={(t) => updateBilling('state', t)}
                  placeholder="NY"
                  placeholderTextColor="#BBBBC0"
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.fieldLabel}>ZIP Code</Text>
                <TextInput
                  style={styles.input}
                  value={billing.zip}
                  onChangeText={(t) => updateBilling('zip', t.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10001"
                  placeholderTextColor="#BBBBC0"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1.8 }}>
                <Text style={styles.fieldLabel}>Country</Text>
                <TextInput
                  style={styles.input}
                  value={billing.country}
                  onChangeText={(t) => updateBilling('country', t)}
                  placeholder="United States"
                  placeholderTextColor="#BBBBC0"
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>
        )}

        {/* Save button */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>Save Changes</Text>
        </TouchableOpacity>

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
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 5,
  },
  savedCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  savedCardBrand: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  defaultBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  defaultBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  savedCardNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 2,
    marginBottom: 18,
    fontVariant: ['tabular-nums'],
  },
  savedCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  savedCardExpLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 2,
  },
  savedCardExpValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
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
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderStyle: 'dashed',
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

  // Form card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 4,
  },

  // Inputs
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.3,
    marginBottom: 6,
    marginTop: 12,
  },
  optionalLabel: {
    fontWeight: '400',
    color: '#BBB',
    fontSize: 11,
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Billing same as shipping
  sameAsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: '#CCC',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.bluePrimary,
    borderColor: colors.bluePrimary,
  },
  sameAsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },

  // Save button
  saveBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    shadowColor: colors.bluePrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
