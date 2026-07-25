import './setup';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onUserCreate } from './authTrigger';
export { setUserAccess } from './users';
export { exportCsv, reportTotals } from './reporting';
export { autoCloseStaleSessions } from './sessions';
export { notifyNewUser, notifyTimesheet, weeklyReminder } from './notify';
// Post-deploy index/query verification (token-guarded; see probe.ts).
export { probeQueries } from './probe';
