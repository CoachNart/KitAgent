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
  const requestIp = getRequestIp(request);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const [userSnapshot, deviceSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(deviceRef),
      ]);

      if (deviceSnapshot.exists && deviceSnapshot.data().uid !== uid) {
        throw new HttpsError('permission-denied', 'This device is already linked to another KitAgent account.');
      }

      if (userSnapshot.exists) {
        const profile = userSnapshot.data();
        if (profile.deviceBindingId && profile.deviceBindingId !== deviceBindingId) {
          throw new HttpsError('permission-denied', 'This KitAgent account is linked to another device. Account recovery is required.');
        }

        transaction.set(userRef, {
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenIp: requestIp,
        }, { merge: true });

        if (!deviceSnapshot.exists) {
          transaction.create(deviceRef, {
            uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeenIp: requestIp,
          });
        } else {
          transaction.set(deviceRef, {
            lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeenIp: requestIp,
          }, { merge: true });
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
        lastSeenIp: requestIp,
      };

      transaction.create(userRef, profile);
      transaction.create(deviceRef, {
        uid,
        createdAt: now,
        lastSeenAt: now,
        lastSeenIp: requestIp,
      });
      return { ok: true, created: true };
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('initializeKitAgentAccount failed', {
      code: error?.code,
      message: error?.message,
      uid,
    });
    throw new HttpsError('internal', 'KitAgent could not finish account verification. Please try again.');
  }
});

exports.onUserCreated = onDocumentCreated('users/{uid}', async (event) => {
  if (!event.data) return;
  await event.data.ref.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
});
