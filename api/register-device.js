import admin from 'firebase-admin';
import fs from 'node:fs';

function getAdmin() {
  if (admin.apps.length) return admin;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    if (raw) {
      const value = raw.trim().replace(/^['"]|['"]$/g, '');
      const serviceAccount = JSON.parse(value);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      return admin;
    }

    if (credentialPath && fs.existsSync(credentialPath)) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath, 'utf8'))) });
      return admin;
    }

    const error = new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');
    error.code = 'FIREBASE_ADMIN_CREDENTIALS_MISSING';
    throw error;
  } catch (error) {
    if (error?.code === 'FIREBASE_ADMIN_CREDENTIALS_MISSING') throw error;
    const wrapped = new Error('FIREBASE_ADMIN_CREDENTIALS_INVALID');
    wrapped.code = 'FIREBASE_ADMIN_CREDENTIALS_INVALID';
    throw wrapped;
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  try {
    const a = getAdmin();
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return json(res, 401, { error: 'Authentication required.', code: 'AUTH_TOKEN_MISSING' });

    let decoded;
    try {
      decoded = await a.auth().verifyIdToken(token);
    } catch {
      return json(res, 401, { error: 'Authentication token could not be verified.', code: 'AUTH_TOKEN_INVALID' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const deviceId = body.deviceId;
    if (!/^[a-f0-9]{64}$/.test(deviceId || '')) return json(res, 400, { error: 'Invalid device binding.', code: 'DEVICE_ID_INVALID' });

    const db = a.firestore();
    const deviceRef = db.collection('deviceBindings').doc(deviceId);
    const userRef = db.collection('users').doc(decoded.uid);

    await db.runTransaction(async (tx) => {
      const deviceSnap = await tx.get(deviceRef);
      const userSnap = await tx.get(userRef);
      const device = deviceSnap.exists ? deviceSnap.data() : null;
      const user = userSnap.exists ? userSnap.data() : null;

      if (device?.uid && device.uid !== decoded.uid) {
        const e = new Error('DEVICE_ALREADY_REGISTERED');
        e.code = e.message;
        throw e;
      }

      if (user?.securitySettings?.deviceBindingId && user.securitySettings.deviceBindingId !== deviceId) {
        const e = new Error('ACCOUNT_ALREADY_BOUND');
        e.code = e.message;
        throw e;
      }

      if (!deviceSnap.exists) {
        tx.create(deviceRef, {
          uid: decoded.uid,
          createdAt: a.firestore.FieldValue.serverTimestamp(),
          lastSeenAt: a.firestore.FieldValue.serverTimestamp(),
          version: 2,
        });
      } else {
        tx.update(deviceRef, { lastSeenAt: a.firestore.FieldValue.serverTimestamp() });
      }

      if (userSnap.exists) {
        tx.update(userRef, {
          securitySettings: { ...(user.securitySettings || {}), deviceBindingId: deviceId },
          updatedAt: a.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const now = new Date();
        const end = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        tx.create(userRef, {
          uid: decoded.uid,
          email: decoded.email || '',
          displayName: decoded.name || '',
          photoURL: decoded.picture || '',
          status: 'active',
          plan: 'free',
          monthlyUsage: { used: 0, limit: 0 },
          subscription: {
            name: 'Premium',
            price: 30,
            currency: 'USD',
            billingPeriod: 'month',
            accessDays: 30,
            features: ['Unlimited setups', 'Live intelligence'],
            paymentAsset: 'USDT',
            paymentNetwork: 'BNB Chain',
            paymentAddress: '0x1c35bf9d920e1b5d7e7e37ce1d15a1b9500f8474',
          },
          api: { status: 'coming_soon' },
          securitySettings: { deviceBindingId: deviceId },
          trialStartedAt: now,
          trialEndsAt: end,
          createdAt: a.firestore.FieldValue.serverTimestamp(),
          updatedAt: a.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return json(res, 200, { allowed: true, deviceId });
  } catch (error) {
    if (error?.code === 'DEVICE_ALREADY_REGISTERED') return json(res, 409, { error: 'This device is already registered to another KitAgent account.', code: error.code });
    if (error?.code === 'ACCOUNT_ALREADY_BOUND') return json(res, 409, { error: 'This account is already bound to another device.', code: error.code });
    if (error?.code === 'FIREBASE_ADMIN_CREDENTIALS_MISSING') return json(res, 500, { error: 'Firebase Admin credentials are missing.', code: error.code });
    if (error?.code === 'FIREBASE_ADMIN_CREDENTIALS_INVALID') return json(res, 500, { error: 'Firebase Admin credentials are invalid.', code: error.code });
    console.error('register-device failed', error);
    return json(res, 500, { error: 'Device registration could not be completed.', code: 'DEVICE_REGISTRATION_FAILED' });
  }
}
