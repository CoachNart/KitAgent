import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { db, firebaseConfigured } from './firebase.js';

let foregroundUnsubscribe = null;
const TOKEN_KEY='kitsetups-fcm-token';

export async function enableKitSetupsNotifications(user) {
  if (typeof window === 'undefined' || !('Notification' in window)) return { enabled:false, reason:'unsupported' };
  if (Notification.permission === 'denied') return { enabled:false, reason:'denied' };

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') return { enabled:false, reason:permission };

  if (!firebaseConfigured) {
    return { enabled:true, foregroundOnly:true, reason:'firebase-not-configured' };
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return { enabled:true, foregroundOnly:true, reason:'push-unsupported' };

  const messaging = getMessaging(getApp());
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;

  const serviceWorkerRegistration = await navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .catch((error) => {
      console.warn('KitSetups push service worker registration failed:', error);
      return undefined;
    });

  const token = await getToken(messaging, {
    ...(vapidKey ? { vapidKey } : {}),
    ...(serviceWorkerRegistration ? { serviceWorkerRegistration } : {}),
  }).catch((error) => {
    console.warn('KitSetups push token registration failed:', error);
    return null;
  });

  if (token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (db && user?.uid) {
        await setDoc(doc(db, 'users', user.uid), {
          notificationSettings: { enabled:true, browser:true, updatedAt:serverTimestamp() },
          pushTokens: { [token]: { platform:'web', updatedAt:serverTimestamp() } },
        }, { merge:true });
      }
    } catch (error) {
      console.warn('KitSetups push token could not be saved:', error);
    }
  }

  if (foregroundUnsubscribe) foregroundUnsubscribe();
  foregroundUnsubscribe = onMessage(messaging, (payload) => {
    const title = payload?.notification?.title || 'KitSetups alert';
    const body = payload?.notification?.body || 'You have a new market notification.';
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon:'/kitsetups-logo.svg',
          badge:'/kitsetups-logo.svg',
          tag:payload?.data?.alertId || 'kitsetups-alert',
        });
      } catch {}
    }
  });

  return { enabled:true, tokenRegistered:Boolean(token), foregroundOnly:!token };
}

export function disableKitSetupsForegroundNotifications() {
  if (foregroundUnsubscribe) foregroundUnsubscribe();
  foregroundUnsubscribe = null;
}
