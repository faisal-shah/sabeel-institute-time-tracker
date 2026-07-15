// Firebase WEB APP client config — NOT a secret (it ships in every client bundle).
// ⚠️ PLACEHOLDER until the real Firebase project exists (TODO.md): everything works
// against the emulators with projectId demo-sabeel; replace with the config object
// from Firebase console → Project settings → Your apps → Web app.
export const firebaseConfig = {
  apiKey: 'demo-placeholder-api-key',
  authDomain: 'demo-sabeel.firebaseapp.com',
  projectId: 'demo-sabeel',
  appId: '1:000000000000:web:placeholder',
};


// *******************************************************************
// HERE IS THE CODE SNIPPET I GOT FROM FIREBASE
// INTEGRATE INTO THE ABOVE AND THEN DELETE THIS AND EVERYTHING BELOW
// *******************************************************************
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBw-htGUNKD_wIY5p6d_HTTJMzES5axWMI",
  authDomain: "sabeel-institute-time-tracker.firebaseapp.com",
  projectId: "sabeel-institute-time-tracker",
  storageBucket: "sabeel-institute-time-tracker.firebasestorage.app",
  messagingSenderId: "858585609550",
  appId: "1:858585609550:web:eb1b0c69cee5248d145a1f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
