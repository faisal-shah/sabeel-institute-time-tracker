// Android push registration (web sibling: notify.web.ts). Asks for permission,
// grabs the native FCM device token, and files it under the user's pushTokens
// so Cloud Functions can reach this device. Never throws — notifications are
// best-effort and must not disturb sign-in.
import { useEffect } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import {
  COLLECTIONS,
  PUSH_CHANNEL_ID,
  PUSH_CHANNEL_NAME,
  decodeNotifRoute,
  type PushTokenDoc,
} from '@sabeel/shared';
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

/**
 * Native can deep-link to its own settings page, so a blocked device gets a
 * button rather than instructions. The web sibling cannot — see there.
 */
export const canOpenPushSettings = true;

export function openPushSettings(): void {
  // openSettings REJECTS when the platform cannot honour it, and a bare `void`
  // would leave that unhandled. There is nothing useful to do about it: the
  // screen has already said where the setting lives.
  void Linking.openSettings().catch(() => undefined);
}

/** Mirrors the web sibling — see notify.web.ts for why this is not a boolean. */
export type PushEnableResult = 'granted' | 'denied' | 'unavailable';

/**
 * What the notification settings screen should offer. Mirrors the web sibling;
 * `canAskAgain` is Android's way of saying the prompt has been spent, which is
 * the same dead end as a browser 'denied'.
 */
export async function pushPromptState(): Promise<
  'granted' | 'denied' | 'default' | 'unsupported'
> {
  // Deliberately says nothing about USE_EMULATORS — the web sibling explains
  // why. What the DEVICE will permit does not depend on which Firebase backend
  // it is pointed at, and reporting 'unsupported' locally hid the whole control
  // from every emulator-backed run. Registration is what the emulator gates.
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) return 'granted';
    return perm.canAskAgain ? 'default' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask for permission and register — the settings screen's "turn these on".
 *
 * The web sibling has to be called straight from a press and may not await
 * first; Android has no such rule, so this is just `registerPush`, which
 * already prompts here. Sign-in still prompts on Android for the same reason —
 * it works — so this button is normally only reached by someone who declined
 * earlier.
 */
export async function enablePush(uid: string): Promise<PushEnableResult> {
  // The RETURN, not just the permission afterwards. Permission granted with no
  // token filed — an emulator run, a device that refused the token — is not a
  // success, and reporting it as one puts "enabled" over a device that will
  // receive nothing. Same three outcomes as the web sibling.
  if (await registerPush(uid)) return 'granted';
  const state = await pushPromptState();
  if (state === 'granted' || state === 'unsupported') return 'unavailable';
  // 'default' here means the system dialog was dismissed rather than refused —
  // still askable, so the screen re-reads the state and keeps offering.
  return 'denied';
}

/**
 * Channels this app used to post to and never will again. Deleted on every
 * registration, because each one lingers in Android's notification settings as a
 * switch that does nothing — which is the whole defect PUSH_CHANNEL_ID exists to
 * end, and leaving these behind reproduces it three times over.
 *
 * `default` is ours: the app created it and no send ever named it. The other two
 * belong to the transports, and Android labels BOTH of them "Miscellaneous" —
 * which is why a device that ran the old build shows two identical entries by
 * that name. They were created because a send that names no channel is not
 * rejected: whichever side displays it invents a home for it.
 *
 *   fcm_fallback_notification_channel              firebase-messaging, backgrounded
 *   expo_notifications_fallback_notification_channel   expo-notifications, foreground
 *
 * Deleting them sticks only because nothing can recreate them now. Both sides
 * read the SAME field: FCM's SDK uses `android.notification.channel_id`, and
 * expo's FirebaseNotificationTrigger.getNotificationChannel() returns
 * `remoteMessage.notification?.channelId`. The server sets it on every send and
 * the manifest names PUSH_CHANNEL_ID as the default, so neither transport has a
 * reason to fall back. Remove either of those and these come straight back.
 */
const RETIRED_CHANNEL_IDS = [
  'default',
  'fcm_fallback_notification_channel',
  'expo_notifications_fallback_notification_channel',
];

export async function registerPush(uid: string): Promise<boolean> {
  try {
    // BEFORE the token, or the first message can race the channel into
    // existence. The server addresses this same id — see PUSH_CHANNEL_ID for why
    // both sides must name it and why the importance has to be right first time.
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: PUSH_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
    });
    for (const dead of RETIRED_CHANNEL_IDS) {
      // Failure is fine: on a fresh install there is nothing to delete.
      await Notifications.deleteNotificationChannelAsync(dead).catch(() => undefined);
    }
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;
    // FCM has no emulator, so a token minted here could never be delivered to
    // and would make local runs non-deterministic. BELOW the channel setup and
    // the prompt, and that placement is the point: with this on the first line
    // an emulator-backed build — the only kind that reaches the AVD outside a
    // release — could never create the channel or raise the dialog even once,
    // which left the one native surface a browser cannot reach unverifiable
    // from the only place it can be looked at.
    if (USE_EMULATORS) return false;
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return false;
    const body: PushTokenDoc = { token, platform: 'android', updatedAt: Date.now() };
    await setDoc(doc(db, COLLECTIONS.users, uid, 'pushTokens', token), body);
    return true;
  } catch (e) {
    captureError(e, { source: 'registerPush' });
    return false;
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
