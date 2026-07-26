// Web push registration. Requires the Web Push certificate (VAPID) public key
// in EXPO_PUBLIC_FCM_VAPID_KEY (app/.env.local — not a secret, but env-local)
// and the service worker at /firebase-messaging-sw.js (app/public/). Without
// either, this quietly does nothing. Never throws.
import { useEffect } from 'react';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, decodeNotifRoute, type PushTokenDoc } from '@sabeel/shared';
import { app, db } from './firebase';
import { USE_EMULATORS } from './env';
import { openNotifRoute } from './notifRouting';
import { captureError } from './sentry';

const VAPID_KEY = process.env.EXPO_PUBLIC_FCM_VAPID_KEY ?? '';

/**
 * Route notification taps. A browser can't hand the page a payload — clicking a
 * web push just opens fcm_options.link — so the route arrives as the query
 * string and is stripped once read, otherwise a reload would re-navigate.
 */
export function useNotifTaps(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (![...params.keys()].length) return;
    const route = decodeNotifRoute(Object.fromEntries(params));
    window.history.replaceState({}, '', window.location.pathname);
    if (route) openNotifRoute(route);
  }, []);
}

export async function registerPush(uid: string): Promise<void> {
  if (USE_EMULATORS || !VAPID_KEY) return;
  try {
    if (!(await isSupported())) return;
    if ((await Notification.requestPermission()) !== 'granted') return;
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
    if (!token) return;
    const body: PushTokenDoc = { token, platform: 'web', updatedAt: Date.now() };
    await setDoc(doc(db, COLLECTIONS.users, uid, 'pushTokens', token), body);
  } catch (e) {
    captureError(e, { source: 'registerPush' });
  }
}

/**
 * Called on sign-out: pushes target the DEVICE/browser, not the session, so
 * without this a shared browser keeps getting the previous account's
 * notifications. getToken here never prompts — if permission was granted it
 * returns the existing token, otherwise this is a no-op.
 */
export async function unregisterPush(uid: string): Promise<void> {
  if (USE_EMULATORS || !VAPID_KEY) return;
  try {
    if (!(await isSupported()) || Notification.permission !== 'granted') return;
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
    if (!token) return;
    await deleteDoc(doc(db, COLLECTIONS.users, uid, 'pushTokens', token));
  } catch {
    // Nothing registered, nothing to do.
  }
}
