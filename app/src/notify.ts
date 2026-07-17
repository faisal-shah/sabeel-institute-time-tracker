// Android push registration (web sibling: notify.web.ts). Asks for permission,
// grabs the native FCM device token, and files it under the user's pushTokens
// so Cloud Functions can reach this device. Never throws — notifications are
// best-effort and must not disturb sign-in.
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, type PushTokenDoc } from '@sabeel/shared';
import { db } from './firebase';
import { USE_EMULATORS } from './env';
import { captureError } from './sentry';

// Foreground notifications still show as banners (default is silent-drop).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerPush(uid: string): Promise<void> {
  if (USE_EMULATORS) return; // FCM has no emulator; keep dev runs deterministic
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    const body: PushTokenDoc = { token, platform: 'android', updatedAt: Date.now() };
    await setDoc(doc(db, COLLECTIONS.users, uid, 'pushTokens', token), body);
  } catch (e) {
    captureError(e, { source: 'registerPush' });
  }
}
