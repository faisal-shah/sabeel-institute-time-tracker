// TEMPORARY greenfield wipe for the Phase 7 rollout. NOT exported from index.ts
// in normal operation — at deploy time it is exported, deployed, invoked ONCE via
// curl with the WIPE_TOKEN, then the export is removed and functions redeployed.
//
// Deletes ALL Auth users and ALL docs in timeEntries/activities/timesheets, and
// every users/{uid} doc EXCEPT the keeper (faisal), whose doc is reset to a clean
// admin state (no running session; approver = self, admins self-approve).
import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const KEEP_EMAIL = 'faisal.shah@gmail.com';

export const wipeForTimesheets = onRequest(async (req, res) => {
  const token = process.env.WIPE_TOKEN ?? '';
  if (!token || req.query.token !== token) {
    res.status(403).send('Forbidden.\n');
    return;
  }

  const auth = getAuth();
  const db = getFirestore();

  const keeper = await auth.getUserByEmail(KEEP_EMAIL);

  // Auth users (paged), keeper excluded.
  let deletedUsers = 0;
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const doomed = page.users.map((u) => u.uid).filter((uid) => uid !== keeper.uid);
    if (doomed.length > 0) {
      const r = await auth.deleteUsers(doomed);
      deletedUsers += r.successCount;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // Firestore collections, keeper's user doc excluded.
  let deletedDocs = 0;
  for (const c of ['timeEntries', 'activities', 'timesheets', 'users']) {
    const snap = await db.collection(c).get();
    for (const d of snap.docs) {
      if (c === 'users' && d.id === keeper.uid) continue;
      await d.ref.delete();
      deletedDocs++;
    }
  }

  // Clean admin state for the keeper: no running session, self-approving.
  await db.collection('users').doc(keeper.uid).set(
    { activeEntryId: null, approverUid: keeper.uid },
    { merge: true },
  );

  res
    .status(200)
    .send(`Wiped: ${deletedUsers} auth users, ${deletedDocs} docs. Kept ${KEEP_EMAIL}.\n`);
});
