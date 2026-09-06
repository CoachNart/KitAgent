const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');

admin.initializeApp();
const db = admin.firestore();
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function cleanDeviceId(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function getRequestIp(request) {
  return request.rawRequest?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || request.rawRequest?.ip
    || null;
}

exports.initializeKitAgentAccount = onCall({ region: 'us-central1', enforceAppCheck: false }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');

  const uid = request.auth.uid;
  const deviceBindingId = cleanDeviceId(request.data?.deviceBindingId);
  if (!deviceBindingId) throw new HttpsError('invalid-argument', 'A valid device binding is required.');

  const userRef = db.doc(`users/${uid}`);
  const deviceRef = db.doc(`deviceBindings/${deviceBindingId}`);
  const existing = await userRef.get();
  const device = await deviceRef.get();

  if (device.exists && device.data().uid !== uid) {
    throw new HttpsError('permission-denied', 'This device is already linked to another KitAgent account.');
  }

  if (existing.exists) {
    const profile = existing.data();
    if (profile.deviceBindingId && profile.deviceBindingId !== deviceBindingId) {
      throw new HttpsError('permission-denied', 'This KitAgent account is linked to another device. Account recovery is required.');
    }

    await userRef.set({
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeenIp: getRequestIp(request),
    }, { merge: true });

    if (!device.exists) {
      await deviceRef.create({
        uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeenIp: getRequestIp(request),
      });
    }
    return { ok: true, created: false };
  }

  const now = admin.firestore.Timestamp.now();
  const trialEndsAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + THREE_DAYS_MS);
  const profile = {
    email: request.auth.token.email || '',
    createdAt: now,
    trialStartedAt: now,
    trialEndsAt,
    premiumUntil: null,
    walletAddress: null,
    maxRiskPercent: 1.5,
    maxTradeSize: 1000,
    deviceBindingId,
    status: 'active',
    lastSeenAt: now,
    lastSeenIp: getRequestIp(request),
  };

  const batch = db.batch();
  batch.create(userRef, profile);
  batch.create(deviceRef, {
    uid,
    createdAt: now,
    lastSeenAt: now,
    lastSeenIp: getRequestIp(request),
  });
  await batch.commit();
  return { ok: true, created: true };
});

exports.onUserCreated = onDocumentCreated('users/{uid}', async (event) => {
  if (!event.data) return;
  await event.data.ref.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
});
