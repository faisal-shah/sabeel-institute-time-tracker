// Where tapping a notification lands. The destination travels with the push as
// flat string key/values, which is what BOTH transports can carry natively: an
// FCM data payload is string-to-string, and the web build reads the identical
// keys off the URL query when the browser opens fcm_options.link. One encoder,
// one decoder, both surfaces.
import { WEB_APP_ORIGIN } from './constants';

export type NotifRoute =
  /** Pending account requests (admins). */
  | { screen: 'Users' }
  /** My own timesheet, anchored at a week. */
  | { screen: 'Timesheet'; periodKey: string }
  /** Someone else's week, for the approver who has to decide it. */
  | { screen: 'TimesheetReview'; uid: string; displayName: string; periodKey: string };

export function encodeNotifRoute(route: NotifRoute): Record<string, string> {
  return { ...route };
}

/**
 * Decode a route from untrusted input — an FCM data bag or a URL query. Anything
 * unrecognised or incomplete yields null, which the caller treats as "just open
 * the app": a notification whose destination we can't read must never crash or
 * navigate somewhere arbitrary.
 */
export function decodeNotifRoute(data: unknown): NotifRoute | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const str = (key: string): string | null => {
    const v = d[key];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  switch (d.screen) {
    case 'Users':
      return { screen: 'Users' };
    case 'Timesheet': {
      const periodKey = str('periodKey');
      return periodKey ? { screen: 'Timesheet', periodKey } : null;
    }
    case 'TimesheetReview': {
      const uid = str('uid');
      const displayName = str('displayName');
      const periodKey = str('periodKey');
      return uid && displayName && periodKey
        ? { screen: 'TimesheetReview', uid, displayName, periodKey }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Screens that only exist in the navigator for managers/admins. A member who
 * kept an old notification after being demoted must not be routed into one.
 */
export function notifRouteNeedsApprover(route: NotifRoute): boolean {
  return route.screen === 'Users' || route.screen === 'TimesheetReview';
}

/**
 * The web-push click target: the hosted app with the route as a query string.
 * Built by hand rather than with URLSearchParams — this package is imported by
 * React Native, where that global comes from an incomplete polyfill.
 */
export function notifRouteUrl(route: NotifRoute): string {
  const q = Object.entries(encodeNotifRoute(route))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${WEB_APP_ORIGIN}/?${q}`;
}
