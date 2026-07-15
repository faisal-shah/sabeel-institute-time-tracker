import './setup';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { setUserAccess } from './users';
export { exportCsv, reportTotals } from './reporting';
export { syncToDrive, syncDriveNow } from './drive';
