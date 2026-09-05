import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase Web App config for KitAgent.
// VITE_* values can override these public identifiers in each environment.
// Firebase documents these web config values as non-secret project/app identifiers.
const config={
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY||'AIzaSyCTG8EMwZIJ3qaRkiDERA73pvH8lTtMEGY',
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN||'kitagent-a9fe8.firebaseapp.com',
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID||'kitagent-a9fe8',
  storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET||'kitagent-a9fe8.firebasestorage.app',
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID||'551947138248',
  appId:import.meta.env.VITE_FIREBASE_APP_ID||'1:551947138248:web:e04dc5677e9810d83fa1fd',
};

const missing=Object.entries(config).filter(([,value])=>!value).map(([key])=>key);
if(missing.length)throw new Error(`KitAgent Firebase is not configured. Missing: ${missing.join(', ')}`);

const app=getApps().length?getApp():initializeApp(config);
export const auth=getAuth(app);
export default app;
