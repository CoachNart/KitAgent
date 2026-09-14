import { getApps, getApp, initializeApp } from 'firebase/app';
import { getAuth, initializeRecaptchaConfig } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } from 'firebase/app-check';
import { Capacitor } from '@capacitor/core';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';

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

let nativeAppCheckReady = null;

// Web uses Firebase JS App Check + reCAPTCHA Enterprise.
// Native Android uses the Capacitor Firebase App Check plugin, which uses
// Firebase's Play Integrity provider. The native token is bridged into the
// Firebase JS SDK so Firestore/Auth requests from the WebView can use it.
if (app && isNativeApp) {
  nativeAppCheckReady = FirebaseAppCheck.initialize();

  const nativeProvider = new CustomProvider({
    getToken: async () => {
      await nativeAppCheckReady;
      return FirebaseAppCheck.getToken({ forceRefresh: false });
    },
  });

  initializeAppCheck(app, {
    provider: nativeProvider,
    isTokenAutoRefreshEnabled: true,
  });
} else if (app && appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const appCheck = app && isNativeApp
  ? nativeAppCheckReady
  : (app && appCheckSiteKey ? true : null);

if (auth) {
  initializeRecaptchaConfig(auth).catch(error => {
    console.warn('KitSetups Firebase reCAPTCHA configuration could not be loaded:', error);
  });
}
