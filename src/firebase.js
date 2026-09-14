import { getApps, getApp, initializeApp } from 'firebase/app';
import { getAuth, initializeRecaptchaConfig } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every(Boolean);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

const isNativeApp = Capacitor.isNativePlatform();

// Firebase App Check is intentionally disabled for KitSetups.
// Authentication, backend authorization, device binding and Firestore rules
// remain responsible for application security.
export const appCheck = null;

// Keep Firebase Auth's reCAPTCHA configuration available on web only.
// Native Android does not initialize the web reCAPTCHA configuration.
if (auth && !isNativeApp) {
  initializeRecaptchaConfig(auth).catch(error => {
    console.warn('KitSetups Firebase reCAPTCHA configuration could not be loaded:', error);
  });
}
