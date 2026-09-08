import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { db } from './firebase.js';

let foregroundUnsubscribe = null;

export async function enableKitSetupsNotifications(user) {
  if (!user || !db || typeof window === 'undefined' || !('Notification' in window)) return { enabled: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { enabled: false, reason: 'denied' };
  const supported = await isSupported().catch(() => false);
  if (!supported) return { enabled: false, reason: 'unsupported' };

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { enabled: false, reason: permission };

  const messaging = getMessaging(getApp());
  const token = await getToken(messaging).catch((error) => {
    console.warn('KitSetups push token registration failed:', error);
    return null;
  });
  if (!token) return { enabled: false, reason: 'token-unavailable' };

  await setDoc(doc(db, 'users', user.uid), {
    notificationSettings: { enabled: true, browser: true, updatedAt: serverTimestamp() },
    pushTokens: { [token]: { platform: 'web', updatedAt: serverTimestamp() } },
  }, { merge: true });

  if (foregroundUnsubscribe) foregroundUnsubscribe();
  foregroundUnsubscribe = onMessage(messaging, (payload) => {
    const title = payload?.notification?.title || 'KitSetups alert';
    const body = payload?.notification?.body || 'You have a new market notification.';
    if (Notification.permission === 'granted') new Notification(title, { body, icon: '/kitsetups-logo.svg', badge: '/kitsetups-logo.svg', tag: payload?.data?.alertId || 'kitsetups-alert' });
  });

  return { enabled: true };
}

export function disableKitSetupsForegroundNotifications() {
  if (foregroundUnsubscribe) foregroundUnsubscribe();
  foregroundUnsubscribe = null;
}
