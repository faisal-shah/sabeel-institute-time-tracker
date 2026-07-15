// Firebase WEB APP client config — NOT a secret (it ships in every client bundle).
// From Firebase console → Project settings → Your apps → Web app.
// In emulator mode (EXPO_PUBLIC_USE_EMULATORS=1) firebase.ts overrides projectId to
// the emulator's demo project, so this real config is only used against production.
export const firebaseConfig = {
  apiKey: 'AIzaSyBw-htGUNKD_wIY5p6d_HTTJMzES5axWMI',
  authDomain: 'sabeel-institute-time-tracker.firebaseapp.com',
  projectId: 'sabeel-institute-time-tracker',
  storageBucket: 'sabeel-institute-time-tracker.firebasestorage.app',
  messagingSenderId: '858585609550',
  appId: '1:858585609550:web:eb1b0c69cee5248d145a1f',
};
