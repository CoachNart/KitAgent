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
  const error = new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');
  error.code = error.message;
  throw error;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const a = getAdmin();
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return json(res, 401, { error: 'Sign in to send a community message.' });

    let identity;
    try {
      identity = await a.auth().verifyIdToken(match[1]);
    } catch {
      return json(res, 401, { error: 'Your session expired. Sign in again.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const text = String(body.text || '').trim();
    if (!text) return json(res, 400, { error: 'Write a message first.' });
    if (text.length > 1000) return json(res, 400, { error: 'Messages must be 1,000 characters or fewer.' });

    const user = await a.auth().getUser(identity.uid);
    const displayName = String(user.displayName || user.email?.split('@')[0] || `Trader ${identity.uid.slice(-4)}`).trim().slice(0, 48);
    const photoURL = String(user.photoURL || '').slice(0, 500);
    const db = a.firestore();
    const rateRef = db.collection('communityRateLimits').doc(identity.uid);
    const now = Date.now();

    try {
      await db.runTransaction(async transaction => {
        const rate = await transaction.get(rateRef);
        const lastSentAt = rate.exists ? Number(rate.data().lastSentAtMs || 0) : 0;
        if (now - lastSentAt < 1200) {
          const error = new Error('MESSAGE_RATE_LIMITED');
          error.code = error.message;
          throw error;
        }
        transaction.set(rateRef, { lastSentAtMs: now }, { merge: true });
      });
    } catch (error) {
      if (error?.code === 'MESSAGE_RATE_LIMITED') {
        return json(res, 429, { error: 'Give it a second before sending another message.' });
      }
      throw error;
    }

    const messageRef = await db.collection('communityMessages').add({
      uid: identity.uid,
      displayName,
      photoURL,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return json(res, 201, { ok: true, id: messageRef.id });
  } catch (error) {
    if (error?.code === 'FIREBASE_ADMIN_CREDENTIALS_MISSING') {
      return json(res, 500, { error: 'Community messaging is not configured on the server.' });
    }
    console.error('KitSetups community message failed:', error);
    return json(res, 500, { error: 'Message not sent. Please try again.' });
  }
}
