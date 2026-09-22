import admin from 'firebase-admin';
import fs from 'node:fs';
import { authenticate, requireActiveAccess } from '../server/access.js';
import { biquoteCandles, biquotePrice } from './biquote.js';

export function getAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (raw) { admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw.trim().replace(/^['"]|['"]$/g, '')))}); return admin; }
  if (credentialPath && fs.existsSync(credentialPath)) { admin.initializeApp({credential: admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath,'utf8')))}); return admin; }
  const error=new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING'); error.code=error.message; throw error;
}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));}
function clean(value,max=500){return String(value??'').slice(0,max);}
function toMs(v){if(!v)return NaN; if(typeof v==='number')return v; if(v?.toDate)return v.toDate().getTime(); const n=Date.parse(v); return Number.isFinite(n)?n:NaN;}
function numberOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null;}

export async function marketKlines(signal) {
  try {
    const symbol=String(signal.symbol||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    const startMs=toMs(signal.generatedAt||signal.createdAt);
    if(!symbol||!Number.isFinite(startMs))return [];
    const now=Date.now();
    const market=String(signal.market||'').toLowerCase();
    if(['forex','metals'].includes(market)){const result=await biquoteCandles(signal.symbol,'1m');return result.rows.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4])})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite));}
    if(!['crypto','perpetual'].includes(market))return [];
    const all=[];
    let pageEnd=now,pages=0;
    // Bybit caps each kline response at 1,000 rows. A single request cannot
    // reliably resolve signals older than ~16h on 1-minute candles.
    // Page backwards so outcome verification never silently loses the beginning
    // of a trade's lifecycle.
    while(pageEnd>=startMs&&pages<48){
      const u=new URL('https://api.bybit.com/v5/market/kline');
      u.searchParams.set('category','linear');
      u.searchParams.set('symbol',symbol);
      u.searchParams.set('interval','1');
      u.searchParams.set('start',String(startMs));
      u.searchParams.set('end',String(pageEnd));
      u.searchParams.set('limit','1000');
      const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!r.ok)break;
      const body=await r.json();
      if(body?.retCode!==0||!Array.isArray(body?.result?.list)||!body.result.list.length)break;
      const rows=body.result.list.slice().reverse().map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4])}))
        .filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite));
      if(!rows.length)break;
      all.push(...rows);
      const oldest=rows[0].time;
      if(oldest<=startMs||rows.length<1000)break;
      pageEnd=oldest-1;
      pages+=1;
    }
    return [...new Map(all.map(c=>[c.time,c])).values()]
      .filter(c=>c.time>=startMs&&c.time<=now)
      .sort((a,b)=>a.time-b.time);
  } catch { return []; }
}

export async function currentPrice(signal) {
  const market=String(signal.market||'').toLowerCase();
  if(['forex','metals'].includes(market)){try{return (await biquotePrice(signal.symbol)).mid}catch{return null}}
  const candles=await marketKlines(signal);
  return candles.at(-1)?.close??null;
}

/*
 * Outcome rules:
 * - A signal is never closed from the setup's planned TP/SL alone.
 * - LIMIT orders must first prove entry was traded.
 * - MARKET orders are considered active at their recorded generation/execution time.
 * - TP/SL are evaluated only on candles AFTER activation.
 * - If one OHLC candle touches both TP and SL, candle data cannot prove which happened first,
 *   so the trade stays OPEN. We never guess.
 * - Forex/CFD/metals outcomes are resolved from the same Biquote 1-minute market-data feed used by analysis.
 */
export async function resolveStatus(signal,price,nowMs=Date.now()) {
  if(['target_hit','stop_hit','missed_entry'].includes(signal.status) && signal.closedAt)return signal;
  const market=String(signal.market||'').toLowerCase();
  if(!['crypto','perpetual','forex','metals'].includes(market))return {...signal,currentPrice:price,status:['target_hit','stop_hit','missed_entry'].includes(signal.status)?'watching':signal.status||'watching',result:null,pnlPercent:null,exitPrice:null,closedAt:null,outcomeEvidence:null};
  const candles=await marketKlines(signal); if(!candles.length)return {...signal,currentPrice:price};
  const livePrice=Number.isFinite(Number(price))?price:candles.at(-1)?.close??null;
  const dir=String(signal.direction||'').toUpperCase();
  if(!['LONG','SHORT'].includes(dir))return {...signal,currentPrice:price,status:'watching'};
  const order=String(signal.orderType||'').toUpperCase();
  const entry=Number(order==='LIMIT'?signal.limitEntry:signal.entry),sl=Number(signal.stopLoss),tp1=Number(signal.takeProfit1);
  if(![entry,sl,tp1].every(Number.isFinite))return {...signal,currentPrice:price};
  const generatedMs=toMs(signal.generatedAt||signal.createdAt);
  if(!Number.isFinite(generatedMs))return {...signal,currentPrice:price};
  let active=false,activatedAt=toMs(signal.activatedAt);
  if(order==='MARKET'){active=true;activatedAt=Number.isFinite(activatedAt)?activatedAt:generatedMs;}
  else if(order==='LIMIT' && Number.isFinite(activatedAt))active=true;
  else if(order==='LIMIT'){
    for(const candle of candles){
      if(candle.time<generatedMs)continue;
      const entryTouched=dir==='LONG'?candle.low<=entry&&candle.high>=entry:candle.high>=entry&&candle.low<=entry;
      const invalidated=dir==='LONG'?candle.low<=sl:candle.high>=sl;
      if(invalidated&&!entryTouched)return {...signal,currentPrice:price,status:'missed_entry',result:'missed',missedAt:new Date(candle.time).toISOString(),outcomeEvidence:{source:market==='forex'||market==='metals'?'biquote_1m_ohlc':'bybit_1m_ohlc',engineVersion:'v3',event:'ENTRY_MISSED_INVALIDATION',candleTime:new Date(candle.time).toISOString()}};
      if(entryTouched){
        // A 1m OHLC candle cannot establish whether entry, TP or SL happened first.
        // Activate only after the entry-touching candle has completed so we never
        // manufacture an outcome from an ambiguous entry/exit sequence.
        active=true;activatedAt=candle.time+60000;break;
      }
    }
  } else return {...signal,currentPrice:price,status:'watching'};
  if(!active)return {...signal,currentPrice:price,status:order==='LIMIT'?'limit_pending':'watching'};
  let ambiguous=false;
  const activationCandleStart=Math.floor(Number(activatedAt)/60000)*60000;
  for(const candle of candles){
    if(candle.time<activatedAt)continue;
    // A MARKET signal may be generated part-way through a 1-minute candle.
    // OHLC cannot tell whether TP/SL was touched before or after generation,
    // so the overlapping candle is excluded unless generation happened exactly at its start.
    if(candle.time===activationCandleStart&&Number(activatedAt)>candle.time)continue;
    const hitSL=dir==='LONG'?candle.low<=sl:candle.high>=sl;
    const hitTP=dir==='LONG'?candle.high>=tp1:candle.low<=tp1;
    if(hitSL&&hitTP){ambiguous=true;break;}
    if(hitSL)return {...signal,currentPrice:price,status:'stop_hit',result:'loss',exitPrice:sl,pnlPercent:dir==='LONG'?((sl-entry)/entry)*100:((entry-sl)/entry)*100,closedAt:new Date(candle.time).toISOString(),activatedAt:new Date(activatedAt).toISOString(),outcomeEvidence:{source:'bybit_1m_ohlc',engineVersion:'v3',event:'STOP_TOUCH',candleTime:new Date(candle.time).toISOString()}};
    if(hitTP)return {...signal,currentPrice:price,status:'target_hit',result:'win',exitPrice:tp1,pnlPercent:dir==='LONG'?((tp1-entry)/entry)*100:((entry-tp1)/entry)*100,closedAt:new Date(candle.time).toISOString(),activatedAt:new Date(activatedAt).toISOString(),outcomeEvidence:{source:'bybit_1m_ohlc',engineVersion:'v3',event:'TP1_TOUCH',candleTime:new Date(candle.time).toISOString()}};
  }
  return {...signal,currentPrice:livePrice,status:'open',activatedAt:new Date(activatedAt).toISOString(),ambiguousOutcome:ambiguous||undefined};
}

export default async function handler(req,res){
  if(!['GET','POST','DELETE'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
  try{
    const decoded=await authenticate(req);
    if(req.method==='POST')await requireActiveAccess(decoded.uid);
    const db=getAdmin().firestore(),collection=db.collection('users').doc(decoded.uid).collection('signals');
    if(req.method==='DELETE'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      if(String(body.confirmation||'').trim()!=='CLEAR')return json(res,400,{error:'Type CLEAR to confirm history deletion.'});
      const snapshot=await collection.get();let deleted=0,batch=db.batch(),count=0;
      for(const doc of snapshot.docs){batch.delete(doc.ref);deleted++;count++;if(count===450){await batch.commit();batch=db.batch();count=0;}}
      if(count)await batch.commit();return json(res,200,{ok:true,deleted});
    }
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}),setup=body.setup||{},market=clean(body.market,30),symbol=clean(body.symbol,40),timeframe=clean(body.timeframe,10),bias=clean(setup.bias,10).toUpperCase();
      if(!market||!symbol||!timeframe||!['LONG','SHORT','WAIT'].includes(bias))return json(res,400,{error:'Incomplete signal record.'});
      const ref=collection.doc(),orderType=clean(setup.orderType,20).toUpperCase()||'WAIT';
      const signal={signalId:`KA-${symbol.replace(/[^A-Z0-9]/gi,'').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,userId:decoded.uid,market,symbol,timeframe,direction:bias,orderType,confidence:numberOrNull(setup.confidence),entry:numberOrNull(setup.entry),limitEntry:numberOrNull(setup.limitEntry),stopLoss:numberOrNull(setup.stopLoss),takeProfit1:numberOrNull(setup.takeProfit1),takeProfit2:numberOrNull(setup.takeProfit2),riskReward:clean(setup.riskReward,40),currentPrice:numberOrNull(setup.price),status:bias==='WAIT'?'watching':(orderType==='LIMIT'?'limit_pending':'watching'),result:null,pnlPercent:null,exitPrice:null,closedAt:null,generatedAt:admin.firestore.FieldValue.serverTimestamp(),createdAt:admin.firestore.FieldValue.serverTimestamp(),source:'live-market-analysis-v1'};
      await ref.set(signal);return json(res,201,{ok:true,id:ref.id,signal:{...signal,generatedAt:new Date().toISOString(),createdAt:new Date().toISOString()}});
    }
    const snapshot=await collection.orderBy('generatedAt','desc').limit(100).get(),raw=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})),signals=[];
    const unresolved=raw.filter(s=>!['target_hit','stop_hit','missed_entry'].includes(s.status));
    const priority=[...raw.filter(s=>s.status==='open'),...unresolved.filter(s=>s.status!=='open')];
    const resolvable=new Set(priority.slice(0,24).map(s=>s.id));
    for(const original of raw){
      const resolved=resolvable.has(original.id)?await resolveStatus(original,null):original;
      const patch={};
      for(const key of ['status','result','pnlPercent','exitPrice','closedAt','activatedAt','missedAt','outcomeEvidence']){
        const a=original[key],b=resolved[key];
        const av=a?.toDate?a.toDate().toISOString():String(a??'');
        const bv=b?.toDate?b.toDate().toISOString():String(b??'');
        if(av!==bv)patch[key]=b??null;
      }
      if(Object.keys(patch).length)await collection.doc(original.id).set(patch,{merge:true});
      if(['open','target_hit','stop_hit','missed_entry'].includes(String(resolved.status||'')))signals.push(resolved);
    }
    return json(res,200,{ok:true,signals});
  }catch(error){
    const status=['AUTH_REQUIRED','AUTH_INVALID','AUTH_TOKEN_MISSING','AUTH_TOKEN_INVALID'].includes(error?.code)?401:error?.code==='ACCESS_EXPIRED'?403:500;
    return json(res,status,{error:error?.message||'Signal record operation failed.',code:error?.code||'SIGNAL_RECORD_FAILED'});
  }
}
