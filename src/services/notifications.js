import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { savePushToken } from './supabase';

const STORAGE_KEY_PREFS = '@homegenie_notif_prefs';
const STORAGE_KEY_PUSH  = '@homegenie_notif_push';

// Legacy keys from the SnapSpace era — used for one-time migration
const LEGACY_KEY_PREFS = '@snapspace_notif_prefs';
const LEGACY_KEY_PUSH  = '@snapspace_notif_push';

/**
 * Migrates a single AsyncStorage key from the old SnapSpace prefix to the new
 * HomeGenie prefix. Reads the old key, writes its value to the new key, then
 * deletes the old key. No-op if the old key doesn't exist or migration already
 * happened (new key already has a value).
 */
async function migrateKey(legacyKey, newKey) {
  try {
    const [legacyValue, existingValue] = await Promise.all([
      AsyncStorage.getItem(legacyKey),
      AsyncStorage.getItem(newKey),
    ]);
    // Only migrate if legacy data exists and new key hasn't been written yet
    if (legacyValue !== null && existingValue === null) {
      await AsyncStorage.setItem(newKey, legacyValue);
      await AsyncStorage.removeItem(legacyKey);
    }
  } catch {
    // Non-fatal — preferences will fall back to defaults
  }
}

/**
 * Runs the one-time migration for both notification preference keys.
 * Safe to call multiple times — it's a no-op once the old keys are gone.
 */
async function migrateNotificationKeys() {
  await Promise.all([
    migrateKey(LEGACY_KEY_PREFS, STORAGE_KEY_PREFS),
    migrateKey(LEGACY_KEY_PUSH, STORAGE_KEY_PUSH),
  ]);
}

// Controls how notifications appear when the app is in the foreground.
// Wrapped in try-catch: on simulator dev builds without the aps-environment
// entitlement, this triggers a native Keychain access that throws.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // Non-fatal on simulator — push notifications won't work but app runs fine
}

/**
 * Requests push notification permission and registers the device.
 * Saves the Expo push token to the user's Supabase profile row.
 * Should be called once after the user signs in.
 *
 * @param {string} userId - The authenticated user's Supabase UUID
 * @returns {string|null} The Expo push token, or null if permission was denied
 */
export async function registerForPushNotifications(userId) {
  if (!Device.isDevice) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync();

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'HomeGenie',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0B6DC3',
      });
    }

    if (userId && token) {
      try {
        await savePushToken(userId, token);
      } catch {
        // Non-fatal — don't block the user if token save fails
      }
    }

    return token;
  } catch {
    // Keychain / entitlement errors on simulator dev builds are non-fatal
    return null;
  }
}

/**
 * Schedules a local notification immediately.
 * Useful for order confirmations, liked designs, etc.
 */
export async function sendLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null,
  });
}

/**
 * Clears the app badge count (iOS).
 */
export async function clearBadge() {
  await Notifications.setBadgeCountAsync(0);
}

/**
 * Sends a local notification only if:
 *  1. The master push toggle (@homegenie_notif_push) is enabled
 *  2. The specific notification type (@homegenie_notif_prefs[notifId]) is enabled
 *
 * Notification IDs match the keys in NotificationsScreen:
 *   'orders' | 'likes' | 'followers' | 'ai_ready' | 'ai_tips' | 'deals' | 'newsletter'
 *
 * @param {string} notifId  - The notification preference key
 * @param {string} title    - Notification title
 * @param {string} body     - Notification body
 * @param {object} data     - Optional payload (e.g. { screen: 'RoomResult' })
 */
export async function sendNotificationIfEnabled(notifId, title, body, data = {}) {
  try {
    // Migrate legacy SnapSpace keys on first read
    await migrateNotificationKeys();

    const [rawPush, rawPrefs] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_PUSH),
      AsyncStorage.getItem(STORAGE_KEY_PREFS),
    ]);

    // Default master push to true if never set, individual prefs default on for key notifs
    const pushEnabled = rawPush !== null ? JSON.parse(rawPush) : true;
    const prefs       = rawPrefs ? JSON.parse(rawPrefs) : {};

    // Individual pref defaults: orders, likes, followers, ai_ready are on by default
    const defaultOn = ['orders', 'likes', 'followers', 'ai_ready'];
    const prefEnabled = notifId in prefs ? prefs[notifId] : defaultOn.includes(notifId);

    if (!pushEnabled || !prefEnabled) return;

    await sendLocalNotification(title, body, data);
  } catch {
    // Non-fatal
  }
}
