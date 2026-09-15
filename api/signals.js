import admin from 'firebase-admin';
import fs from 'node:fs';
import { authenticate, requireActiveAccess } from '../server/access.js';

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

function clean(value, max = 500) {
  return String(value ?? '').slice(0, max);
}

async function currentPrice(signal) {
  try {
    const symbol=String(signal.symbol||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if(!symbol)return null;
    if(signal.market==='perpetual'){
      const r=await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`,{headers:{Accept:'application/json'}}); const b=await r.json(); const p=Number(b?.price); return Number.isFinite(p)?p:null;
    }
    if(signal.market==='crypto'){
      const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,{headers:{Accept:'application/json'}}); const b=await r.json(); const p=Number(b?.price); return Number.isFinite(p)?p:null;
    }
    const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(signal.symbol+'=X')}?range=1d&interval=5m`,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}}); const b=await r.json(); const q=b?.chart?.result?.[0]; const p=Number(q?.meta?.regularMarketPrice ?? q?.indicators?.quote?.[0]?.close?.at(-1)); return Number.isFinite(p)?p:null;
  } catch { return null; }
}
function resolveStatus(signal, price) {
  if (['target_hit','stop_hit','expired','closed'].includes(signal.status)) return signal;
  if (!Number.isFinite(price)) return {...signal,currentPrice:null};
  const dir=String(signal.direction||'').toUpperCase(), entry=Number(signal.entry), sl=Number(signal.stopLoss), tp1=Number(signal.takeProfit1);
  let status=signal.status||'watching', result=signal.result||null, pnl=signal.pnlPercent, exit=signal.exitPrice, closedAt=signal.closedAt;
  if(dir==='LONG') { if(Number.isFinite(sl)&&price<=sl){status='stop_hit';result='loss';exit=sl;pnl=Number.isFinite(entry)?((sl-entry)/entry)*100:null;} else if(Number.isFinite(tp1)&&price>=tp1){status='target_hit';result='win';exit=tp1;pnl=Number.isFinite(entry)?((tp1-entry)/entry)*100:null;} }
  if(dir==='SHORT') { if(Number.isFinite(sl)&&price>=sl){status='stop_hit';result='loss';exit=sl;pnl=Number.isFinite(entry)?((entry-sl)/entry)*100:null;} else if(Number.isFinite(tp1)&&price<=tp1){status='target_hit';result='win';exit=tp1;pnl=Number.isFinite(entry)?((entry-tp1)/entry)*100:null;} }
  if(status!==signal.status) closedAt=new Date().toISOString();
  return {...signal,currentPrice:price,status,result,pnlPercent:pnl,exitPrice:exit,closedAt};
}
function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  try {
    const decoded = await authenticate(req);
    if (req.method === 'POST') await requireActiveAccess(decoded.uid);
    const db = getAdmin().firestore();
    const collection = db.collection('users').doc(decoded.uid).collection('signals');

    if (req.method === 'GET') {
      const snapshot = await collection.orderBy('generatedAt', 'desc').limit(100).get();
      const raw=snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const signals=await Promise.all(raw.map(async signal=>resolveStatus(signal,await currentPrice(signal))));
      return json(res, 200, { ok: true, signals });
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
      orderType: clean(setup.orderType, 20).toUpperCase() || 'WAIT',
      confidence: numberOrNull(setup.confidence),
      entry: numberOrNull(setup.entry),
      limitEntry: numberOrNull(setup.limitEntry),
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
    const status = ['AUTH_REQUIRED','AUTH_INVALID','AUTH_TOKEN_MISSING','AUTH_TOKEN_INVALID'].includes(error?.code) ? 401 : error?.code === 'ACCESS_EXPIRED' ? 403 : 500;
    return json(res, status, { error: error?.message || 'Signal record operation failed.', code: error?.code || 'SIGNAL_RECORD_FAILED' });
  }
}
