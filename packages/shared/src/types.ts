// Firestore document shapes shared by app and functions.
// Timestamps cross this boundary as epoch milliseconds in shared code; each
// surface converts to/from its SDK's Timestamp at the read/write edge.

export type UserStatus = 'pending' | 'active' | 'disabled';
export type UserRole = 'member' | 'manager';

/** Mirrored into the ID token by setUserAccess; what security rules trust. */
export interface TokenClaims {
  status?: UserStatus;
  role?: UserRole;
  admin?: boolean;
}

export interface UserDoc {
  displayName: string;
  email: string;
  photoURL: string | null;
  status: UserStatus;
  role: UserRole;
  admin: boolean;
  activeEntryId: string | null;
  createdAt: number;
  approvedAt?: number;
  approvedBy?: string;
}

export type ActivityType = 'project' | 'event';
export type ActivityStatus = 'active' | 'archived';

export interface ActivityDoc {
  name: string;
  description?: string;
  type: ActivityType;
  status: ActivityStatus;
  /** Events only; display convenience. Epoch ms of the event date. */
  eventDate?: number;
  createdAt: number;
  createdBy: string;
}

export type EntrySource = 'clock' | 'manual';

export interface TimeEntryDoc {
  uid: string;
  activityId: string;
  /** Denormalized for display and CSV. */
  activityName: string;
  start: number;
  /** null while a clock session is running. */
  end: number | null;
  /** Set on close/manual create; ABSENT while running (keeps running sessions out of sum() aggregations). */
  durationMinutes?: number;
  /** IANA timezone of the device that created the entry — the timezone the work happened in. */
  timeZone: string;
  /** 'YYYY-MM-DD' of `start` in `timeZone`. The bucketing key for all day/week views. */
  dayKey: string;
  source: EntrySource;
  note?: string;
  autoClosed?: boolean;
  createdAt: number;
  updatedAt: number;
  /** Present when someone other than the owner last edited (manager correction). */
  lastEditedBy?: string;
}
