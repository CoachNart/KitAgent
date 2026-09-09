import admin from 'firebase-admin';
import fs from 'node:fs';

function getAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (raw) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g, ''))) });
    return admin;
  }
  if (credentialPath && fs.existsSync(credentialPath)) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath, 'utf8'))) });
    return admin;
  }
  const e = new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING'); e.code = e.message; throw e;
}

function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); }
function canonicalEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
  return email;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const a = getAdmin();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.', code: 'INVALID_EMAIL' });
    if (password.length < 6) return json(res, 400, { error: 'Use a stronger password (at least 6 characters).', code: 'WEAK_PASSWORD' });

    const canonical = canonicalEmail(email);
    const db = a.firestore();
    const lockRef = db.collection('accountIdentityLocks').doc(encodeURIComponent(canonical));
    const existingLock = await lockRef.get();
    if (existingLock.exists) return json(res, 409, { error: 'An account already exists for this email identity. Sign in instead.', code: 'ACCOUNT_ALREADY_EXISTS' });

    try {
      const existingUser = await a.auth().getUserByEmail(email);
      if (existingUser) return json(res, 409, { error: 'An account already exists with this email. Sign in instead.', code: 'ACCOUNT_ALREADY_EXISTS' });
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }

    const reservation = { email, canonicalEmail: canonical, createdAt: admin.firestore.FieldValue.serverTimestamp(), status: 'reserved' };
    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(lockRef);
        if (snap.exists) { const e = new Error('ACCOUNT_ALREADY_EXISTS'); e.code = e.message; throw e; }
        tx.create(lockRef, reservation);
      });
    } catch (error) {
      if (error?.code === 'ACCOUNT_ALREADY_EXISTS') return json(res, 409, { error: 'An account already exists for this email identity. Sign in instead.', code: error.code });
      throw error;
    }

    let userRecord;
    try {
      userRecord = await a.auth().createUser({ email, password, emailVerified: false });
      await lockRef.set({ uid: userRecord.uid, status: 'active', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      await lockRef.delete().catch(() => {});
      if (error?.code === 'auth/email-already-exists') return json(res, 409, { error: 'An account already exists with this email. Sign in instead.', code: 'ACCOUNT_ALREADY_EXISTS' });
      throw error;
    }

    const customToken = await a.auth().createCustomToken(userRecord.uid);
    return json(res, 200, { customToken, uid: userRecord.uid });
  } catch (error) {
    if (error?.code === 'FIREBASE_ADMIN_CREDENTIALS_MISSING') return json(res, 500, { error: 'Firebase Admin credentials are missing.', code: error.code });
    console.error('register-account failed', error);
    return json(res, 500, { error: 'Account creation could not be completed.', code: 'ACCOUNT_REGISTRATION_FAILED' });
  }
}
