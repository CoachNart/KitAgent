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
  res.end(JSON.stringify(body));
}

async function authenticate(req) {
  const token = String(req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  if (!token) throw Object.assign(new Error('Authentication required.'), { code: 'AUTH_TOKEN_MISSING' });
  try {
    return await getAdmin().auth().verifyIdToken(token);
  } catch {
    throw Object.assign(new Error('Authentication token could not be verified.'), { code: 'AUTH_TOKEN_INVALID' });
  }
}

function clean(value, max = 500) {
  return String(value ?? '').slice(0, max);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  try {
    const decoded = await authenticate(req);
    const db = getAdmin().firestore();
    const collection = db.collection('users').doc(decoded.uid).collection('signals');

    if (req.method === 'GET') {
      const snapshot = await collection.orderBy('generatedAt', 'desc').limit(100).get();
      return json(res, 200, {
        ok: true,
        signals: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const setup = body.setup || {};
    const market = clean(body.market, 30);
    const symbol = clean(body.symbol, 40);
    const timeframe = clean(body.timeframe, 10);
    const bias = clean(setup.bias, 10).toUpperCase();

    if (!market || !symbol || !timeframe || !['LONG', 'SHORT', 'WAIT'].includes(bias)) {
      return json(res, 400, { error: 'Incomplete signal record.' });
    }

    const ref = collection.doc();
    const signal = {
      signalId: `KA-${symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      userId: decoded.uid,
      market,
      symbol,
      timeframe,
      direction: bias,
      confidence: numberOrNull(setup.confidence),
      entry: numberOrNull(setup.entry),
      stopLoss: numberOrNull(setup.stopLoss),
      takeProfit1: numberOrNull(setup.takeProfit1),
      takeProfit2: numberOrNull(setup.takeProfit2),
      riskReward: clean(setup.riskReward, 40),
      currentPrice: numberOrNull(setup.price),
      swingHigh: numberOrNull(setup.swingHigh),
      swingLow: numberOrNull(setup.swingLow),
      rsi: numberOrNull(setup.rsi),
      ema20: numberOrNull(setup.ema20),
      ema50: numberOrNull(setup.ema50),
      atr: numberOrNull(setup.atr),
      aligned: numberOrNull(body.aligned),
      totalTimeframes: numberOrNull(body.totalTimeframes),
      confluence: Array.isArray(body.confluence) ? body.confluence.slice(0, 12).map((x) => ({
        timeframe: clean(x?.timeframe, 10),
        bias: clean(x?.bias, 10).toUpperCase(),
        confidence: numberOrNull(x?.confidence)
      })) : [],
      status: bias === 'WAIT' ? 'watching' : 'open',
      result: null,
      pnlPercent: null,
      exitPrice: null,
      closedAt: null,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'live-market-analysis-v1'
    };

    await ref.set(signal);
    return json(res, 201, { ok: true, id: ref.id, signal: { ...signal, generatedAt: new Date().toISOString(), createdAt: new Date().toISOString() } });
  } catch (error) {
    const status = error?.code === 'AUTH_TOKEN_MISSING' || error?.code === 'AUTH_TOKEN_INVALID' ? 401 : 500;
    return json(res, status, { error: error?.message || 'Signal record operation failed.', code: error?.code || 'SIGNAL_RECORD_FAILED' });
  }
}
