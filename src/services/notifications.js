import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { savePushToken } from './supabase';

// Controls how notifications appear when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
      name: 'SnapSpace',
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
