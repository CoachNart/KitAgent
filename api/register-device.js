import admin from 'firebase-admin';

function getAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
  const credentials = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(credentials) });
  return admin;
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
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json(res, 401, { error: 'Authentication required.' });
    const decoded = await a.auth().verifyIdToken(token);
    const { deviceId } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!/^[a-f0-9]{64}$/.test(deviceId || '')) return json(res, 400, { error: 'Invalid device binding.' });

    const db = a.firestore();
    const deviceRef = db.collection('deviceBindings').doc(deviceId);
    const userRef = db.collection('users').doc(decoded.uid);
    let result;

    await db.runTransaction(async tx => {
      const [deviceSnap, userSnap] = await Promise.all([tx.get(deviceRef), tx.get(userRef)]);
      if (deviceSnap.exists && deviceSnap.data().uid !== decoded.uid) {
        const error = new Error('DEVICE_ALREADY_REGISTERED');
        error.code = 'DEVICE_ALREADY_REGISTERED';
        throw error;
      }
      if (userSnap.exists && userSnap.data().securitySettings?.deviceBindingId && userSnap.data().securitySettings.deviceBindingId !== deviceId) {
        const error = new Error('ACCOUNT_ALREADY_BOUND');
        error.code = 'ACCOUNT_ALREADY_BOUND';
        throw error;
      }
      if (!deviceSnap.exists) {
        tx.create(deviceRef, { uid: decoded.uid, createdAt: a.firestore.FieldValue.serverTimestamp(), lastSeenAt: a.firestore.FieldValue.serverTimestamp(), version: 2 });
      } else {
        tx.update(deviceRef, { lastSeenAt: a.firestore.FieldValue.serverTimestamp() });
      }
      if (userSnap.exists) tx.set(userRef, { securitySettings: { ...(userSnap.data().securitySettings || {}), deviceBindingId: deviceId } }, { merge: true });
      else tx.set(userRef, { securitySettings: { deviceBindingId: deviceId } }, { merge: true });
      result = { allowed: true, deviceId };
    });
    return json(res, 200, result);
  } catch (error) {
    if (error?.code === 'DEVICE_ALREADY_REGISTERED') return json(res, 409, { error: 'This device is already registered to another KitAgent account.', code: error.code });
    if (error?.code === 'ACCOUNT_ALREADY_BOUND') return json(res, 409, { error: 'This account is already bound to another device.', code: error.code });
    console.error('register-device failed', error);
    return json(res, 500, { error: 'Device registration could not be completed.' });
  }
}
