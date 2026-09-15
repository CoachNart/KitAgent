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

async function marketKlines(signal) {
  try {
    const symbol=String(signal.symbol||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if(!symbol)return [];
    const startMs=Date.parse(signal.generatedAt?.toDate?.() ? signal.generatedAt.toDate().toISOString() : signal.generatedAt || signal.createdAt?.toDate?.() ? signal.createdAt.toDate().toISOString() : signal.createdAt || '');
    if(!Number.isFinite(startMs))return [];
    const now=Date.now();
    const endpoint=signal.market==='perpetual'
      ? `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${startMs}&endTime=${now}&limit=1000`
      : `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${startMs}&endTime=${now}&limit=1000`;
    const r=await fetch(endpoint,{headers:{Accept:'application/json'}});
    const rows=await r.json();
    if(!Array.isArray(rows))return [];
    return rows.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4])})).filter(x=>[x.time,x.high,x.low,x.close].every(Number.isFinite));
  } catch { return []; }
}
async function currentPrice(signal) {
  try {
    const symbol=String(signal.symbol||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if(!symbol)return null;
    if(signal.market==='perpetual'){
      const r=await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`,{headers:{Accept:'application/json'}});
      const b=await r.json(); const p=Number(b?.price); return Number.isFinite(p)?p:null;
    }
    if(signal.market==='crypto'){
      const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,{headers:{Accept:'application/json'}});
      const b=await r.json(); const p=Number(b?.price); return Number.isFinite(p)?p:null;
    }
    return null;
  } catch { return null; }
}
async function resolveStatus(signal, price) {
  if (['target_hit','stop_hit','expired','closed'].includes(signal.status)) return signal;
  if (!['LONG','SHORT'].includes(String(signal.direction||'').toUpperCase())) return {...signal,currentPrice:price};
  const candles=await marketKlines(signal);
  if(!candles.length)return {...signal,currentPrice:price,status:signal.status||'watching'};
  const dir=String(signal.direction).toUpperCase();
  const entry=Number(signal.orderType==='LIMIT' ? signal.limitEntry : signal.entry);
  const sl=Number(signal.stopLoss), tp1=Number(signal.takeProfit1);
  if(!Number.isFinite(entry)||!Number.isFinite(sl)||!Number.isFinite(tp1))return {...signal,currentPrice:price};
  let active=signal.orderType!=='LIMIT';
  let activatedAt=null, outcome=null;
  for(const candle of candles){
    if(!active){
      const activated=dir==='LONG'?candle.high>=entry:candle.low<=entry;
      if(!activated)continue;
      active=true; activatedAt=candle.time;
      const both=dir==='LONG' ? candle.low<=sl&&candle.high>=tp1 : candle.high>=sl&&candle.low<=tp1;
      if(both) return {...signal,currentPrice:price,status:'open',result:null,activatedAt};
      continue;
    }
    const hitSL=dir==='LONG'?candle.low<=sl:candle.high>=sl;
    const hitTP=dir==='LONG'?candle.high>=tp1:candle.low<=tp1;
    if(hitSL&&hitTP) return {...signal,currentPrice:price,status:'open',result:null,activatedAt,ambiguousOutcome:true};
    if(hitSL){outcome={status:'stop_hit',result:'loss',exitPrice:sl,pnlPercent:((sl-entry)/entry)*100}; if(dir==='SHORT')outcome.pnlPercent=((entry-sl)/entry)*100; break;}
    if(hitTP){outcome={status:'target_hit',result:'win',exitPrice:tp1,pnlPercent:((tp1-entry)/entry)*100}; if(dir==='SHORT')outcome.pnlPercent=((entry-tp1)/entry)*100; break;}
  }
  return {...signal,currentPrice:price,...(outcome?{...outcome,closedAt:new Date().toISOString()}:active?{status:'open',activatedAt}:{status:signal.orderType==='LIMIT'?'limit_pending':'open'})};
}
function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  try {
    const decoded = await authenticate(req);
    if (req.method === 'POST' || req.method === 'DELETE') await requireActiveAccess(decoded.uid);
    const db = getAdmin().firestore();
    const collection = db.collection('users').doc(decoded.uid).collection('signals');

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (String(body.confirmation || '').trim() !== 'CLEAR') return json(res, 400, { error: 'Type CLEAR to confirm history deletion.' });
      const snapshot = await collection.get();
      let deleted = 0;
      let batch = db.batch();
      let count = 0;
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        deleted++; count++;
        if (count === 450) { await batch.commit(); batch = db.batch(); count = 0; }
      }
      if (count) await batch.commit();
      return json(res, 200, { ok: true, deleted });
    }

    if (req.method === 'GET') {
      const snapshot = await collection.orderBy('generatedAt', 'desc').limit(100).get();
      const raw=snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const resolved=await Promise.all(raw.map(async signal=>resolveStatus(signal,await currentPrice(signal))));
      const signals=[];
      for(const signal of resolved){
        const original=raw.find(x=>x.id===signal.id);
        const changed=['status','result','pnlPercent','exitPrice','closedAt','activatedAt'].some(k=>String(original?.[k]??'')!==String(signal?.[k]??''));
        if(changed){
          const patch={status:signal.status,result:signal.result??null,pnlPercent:signal.pnlPercent??null,exitPrice:signal.exitPrice??null,closedAt:signal.closedAt??null};
          if(signal.activatedAt)patch.activatedAt=signal.activatedAt;
          await collection.doc(signal.id).set(patch,{merge:true});
        }
        signals.push(signal);
      }
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
