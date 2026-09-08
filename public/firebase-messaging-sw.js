/* KitSetups Firebase Cloud Messaging service worker. The build step replaces the config placeholders automatically. */
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '__VITE_FIREBASE_API_KEY__',
  authDomain: '__VITE_FIREBASE_AUTH_DOMAIN__',
  projectId: '__VITE_FIREBASE_PROJECT_ID__',
  storageBucket: '__VITE_FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__VITE_FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__VITE_FIREBASE_APP_ID__'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'KitSetups alert';
  const options = {
    body: payload?.notification?.body || 'You have a new market notification.',
    icon: '/kitsetups-logo.svg',
    badge: '/kitsetups-logo.svg',
    data: payload?.data || {},
    tag: payload?.data?.alertId || 'kitsetups-alert'
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => 'focus' in client);
    if (existing) return existing.focus();
    return clients.openWindow(target);
  }));
});
