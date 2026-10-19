import admin from 'firebase-admin';
import fs from 'node:fs';

function getAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (raw) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw.trim().replace(/^['"]|['"]$/g, ''))) });
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(JSON.stringify(body));
}

function bodyOf(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const a = getAdmin();
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return json(res, 401, { error: 'Sign in to join the community.' });

    let identity;
    try {
      identity = await a.auth().verifyIdToken(match[1]);
    } catch {
      return json(res, 401, { error: 'Your session expired. Sign in again.' });
    }

    const db = a.firestore();
    const messages = db.collection('communityMessages');

    if (req.method === 'GET') {
      const snapshot = await messages.orderBy('createdAt', 'desc').limit(100).get();
      const result = snapshot.docs.map(item => {
        const data = item.data();
        return {
          id: item.id,
          uid: String(data.uid || ''),
          displayName: String(data.displayName || 'KitSetups trader'),
          photoURL: String(data.photoURL || ''),
          text: String(data.text || ''),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null
        };
      }).reverse();
      return json(res, 200, { ok: true, messages: result });
    }

    if (req.method === 'DELETE') {
      const body = bodyOf(req);
      const messageId = String(body.id || '').trim();
      if (!messageId || messageId.length > 200 || messageId.includes('/')) {
        return json(res, 400, { error: 'A valid message is required.' });
      }
      const ref = messages.doc(messageId);
      const snapshot = await ref.get();
      if (!snapshot.exists) return json(res, 404, { error: 'That message no longer exists.' });
      if (snapshot.data().uid !== identity.uid) return json(res, 403, { error: 'You can only delete your own messages.' });
      await ref.delete();
      return json(res, 200, { ok: true, id: messageId });
    }

    const body = bodyOf(req);
    const text = String(body.text || '').trim();
    if (!text) return json(res, 400, { error: 'Write a message first.' });
    if (text.length > 1000) return json(res, 400, { error: 'Messages must be 1,000 characters or fewer.' });

    const user = await a.auth().getUser(identity.uid);
    const displayName = String(user.displayName || user.email?.split('@')[0] || `Trader ${identity.uid.slice(-4)}`).trim().slice(0, 48);
    const photoURL = String(user.photoURL || '').slice(0, 500);
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

    const messageRef = await messages.add({
      uid: identity.uid,
      displayName,
      photoURL,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return json(res, 201, { ok: true, id: messageRef.id });
  } catch (error) {
    if (error?.code === 'FIREBASE_ADMIN_CREDENTIALS_MISSING') {
      return json(res, 500, { error: 'Community service is not configured on the server.' });
    }
    console.error('KitSetups community request failed:', error);
    return json(res, 500, { error: 'Community is temporarily unavailable. Please try again.' });
  }
}
