/* global importScripts, firebase */
// Background push handler. Served from the web root (expo export copies
// app/public/ into the bundle). Uses the compat build — the modular SDK can't
// importScripts. Config mirrors app/src/firebase-config.ts (public, not secret).
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBw-htGUNKD_wIY5p6d_HTTJMzES5axWMI',
  authDomain: 'sabeel-institute-time-tracker.web.app',
  projectId: 'sabeel-institute-time-tracker',
  storageBucket: 'sabeel-institute-time-tracker.firebasestorage.app',
  messagingSenderId: '858585609550',
  appId: '1:858585609550:web:eb1b0c69cee5248d145a1f',
});

// Notification-type messages are displayed automatically by FCM; instantiating
// messaging here is what wires that up.
firebase.messaging();
