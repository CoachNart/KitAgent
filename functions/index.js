const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');

admin.initializeApp();
const db = admin.firestore();
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

exports.initializeKitAgentAccount = onCall({ region: 'us-central1', enforceAppCheck: false }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const uid = request.auth.uid;
  const userRef = db.doc(`users/${uid}`);
  const existing = await userRef.get();
  if (existing.exists) return { ok: true, created: false };

  const now = admin.firestore.Timestamp.now();
  const trialEndsAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + THREE_DAYS_MS);
  await userRef.create({
    email: request.auth.token.email || '',
    createdAt: now,
    trialStartedAt: now,
    trialEndsAt,
    premiumUntil: null,
    walletAddress: null,
    maxRiskPercent: 1.5,
    maxTradeSize: 1000,
    deviceBindingId: null,
    status: 'active'
  });
  return { ok: true, created: true };
});

exports.onUserCreated = onDocumentCreated('users/{uid}', async (event) => {
  if (!event.data) return;
  await event.data.ref.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
});
