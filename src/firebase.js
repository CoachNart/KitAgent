import { getApps, getApp, initializeApp } from 'firebase/app';
import { getAuth, initializeRecaptchaConfig } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
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

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || '';
const isNativeApp = Capacitor.isNativePlatform();

// The Firebase JS App Check reCAPTCHA Enterprise provider is a web provider.
// KitSetups Android is a Capacitor app, so do not initialize the web provider
// inside the native WebView. This prevents the Web reCAPTCHA key from being
// evaluated against the Android app and producing "Invalid site key".
export const appCheck = app && appCheckSiteKey && !isNativeApp
  ? initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

if (auth) {
  initializeRecaptchaConfig(auth).catch(error => {
    console.warn('KitSetups Firebase reCAPTCHA configuration could not be loaded:', error);
  });
}
