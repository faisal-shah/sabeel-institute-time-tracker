// Android push registration (web sibling: notify.web.ts). Asks for permission,
// grabs the native FCM device token, and files it under the user's pushTokens
// so Cloud Functions can reach this device. Never throws — notifications are
// best-effort and must not disturb sign-in.
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, decodeNotifRoute, type PushTokenDoc } from '@sabeel/shared';
import { db } from './firebase';
import { USE_EMULATORS } from './env';
import { openNotifRoute } from './notifRouting';
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

/**
 * Route notification taps. Two sources, because a tap can arrive in two very
 * different states: the listener covers a running app (foreground or resumed
 * from the background), while getLastNotificationResponseAsync covers the tap
 * that launched a killed app — that one happened before any JS existed, so it
 * can only be collected after the fact. Both can report the SAME tap on a cold
 * start, hence the identifier dedup.
 */
export function useNotifTaps(): void {
  useEffect(() => {
    let live = true;
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (live && r) handleResponse(r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
}

let lastHandledId: string | null = null;

function handleResponse(response: Notifications.NotificationResponse): void {
  const id = response.notification.request.identifier;
  if (id === lastHandledId) return;
  lastHandledId = id;
  const route = decodeNotifRoute(response.notification.request.content.data);
  // No route (or an unreadable one) just means the app opens where it was.
  if (route) openNotifRoute(route);
}

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

/**
 * Called on sign-out: pushes target the DEVICE, not the session, so without
 * this a shared phone keeps getting the previous account's notifications.
 */
export async function unregisterPush(uid: string): Promise<void> {
  if (USE_EMULATORS) return;
  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    await deleteDoc(doc(db, COLLECTIONS.users, uid, 'pushTokens', token));
  } catch {
    // Permission never granted / no token — nothing registered, nothing to do.
  }
}
