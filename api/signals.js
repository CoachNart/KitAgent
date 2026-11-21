import admin from 'firebase-admin';
import fs from 'node:fs';
import { authenticate, requireActiveAccess } from '../server/access.js';
import {isCandleWithinWindow,pendingEntryDeadline} from '../server/market-engine/execution-window.js';
const ACTIVE_STRATEGIES=new Set(['TOP_DOWN','PULLBACK','BREAKOUT','SMC','MSNR','CRT']);
const ENGINE_VERSIONS=new Set(['market-engine-v5','market-engine-v6','market-engine-v7']);
const REQUEST_TIMEFRAMES=new Set(['AUTO','30m','1H','2H','4H']);
const ENTRY_TIMEFRAMES=new Set(['30m','1H','2H','4H']);
const PENDING_ENTRY_WINDOW_MS=24*60*60*1000;
const MONITOR_CANDLE_DURATION_MS=30*60*1000;
const BYBIT_KLINE_HOSTS=['https://api.bybit.com','https://api.bytick.com','https://api.bybit.nl'];

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
function setupFingerprint(s){
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x.toFixed(10):''};
  return [
    String(s?.market||'').toLowerCase(),
    String(s?.symbol||'').replace(/[^A-Z0-9]/gi,'').toUpperCase(),
    String(s?.strategy||'').toUpperCase(),
    String(s?.direction||'').toUpperCase(),
    n(s?.entry),
    n(s?.limitEntry),
    n(s?.stopLoss),
    n(s?.takeProfit1)
  ].join('|');
}
function dedupeSignals(signals){
  const seen=new Set(),out=[];
  for(const signal of signals){
    const key=setupFingerprint(signal);
    if(!key||seen.has(key))continue;
    seen.add(key);out.push(signal);
  }
  return out;
}

export async function marketKlines(signal) {
  try {
    const symbol=String(signal.symbol||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    const startMs=toMs(signal.generatedAt||signal.createdAt);
    if(!symbol||!Number.isFinite(startMs))return [];
    const now=Date.now();
    const market=String(signal.market||'').toLowerCase();
    if(market!=='perpetual')return [];
    const all=[];
    let pageEnd=now,pages=0;
    // Bybit caps each kline response at 1,000 rows. A single request cannot
    // reliably resolve signals older than ~20 days on 30-minute candles.
    // Page backwards so outcome verification never silently loses the beginning
    // of a trade's lifecycle.
    while(pageEnd>=startMs&&pages<48){
      let payload=null;
      for(const host of BYBIT_KLINE_HOSTS){
        try{
          const u=new URL('/v5/market/kline',host);
          u.searchParams.set('category','linear');
          u.searchParams.set('symbol',symbol);
          u.searchParams.set('interval','30');
          u.searchParams.set('start',String(startMs));
          u.searchParams.set('end',String(pageEnd));
          u.searchParams.set('limit','1000');
          const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
          if(!r.ok)continue;
          const body=await r.json();
          if(body?.retCode!==0||!Array.isArray(body?.result?.list)||!body.result.list.length)continue;
          payload=body.result.list;
          break;
        }catch{}
      }
      if(!payload)break;
      const rows=payload.slice().reverse().map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4])}))
        .filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite));
      if(!rows.length)break;
      all.push(...rows);
      const oldest=rows[0].time;
      if(oldest<=startMs||rows.length<1000)break;
      pageEnd=oldest-1;
      pages+=1;
    }
    return [...new Map(all.map(c=>[c.time,c])).values()]
      // Only fully closed 30m candles are eligible for outcome verification.
      .filter(c=>c.time>=startMs&&c.time+MONITOR_CANDLE_DURATION_MS<=now)
      .sort((a,b)=>a.time-b.time);
  } catch { return []; }
}

export async function currentPrice(signal) {
  const market=String(signal.market||'').toLowerCase();
  if(market!=='perpetual')return null;
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
 */
export function selectOutcomeBatch(signals,limit=24,rotation=0){
  const unresolved=(Array.isArray(signals)?signals:[])
    .filter(s=>!['target_hit','stop_hit','missed_entry','activation_ambiguous'].includes(String(s?.status||''))&&s?.ambiguousOutcome!==true);
  const batchSize=Math.max(1,Math.floor(Number(limit)||24));
  const batchCount=Math.max(1,Math.ceil(unresolved.length/batchSize));
  const rawRotation=Math.floor(Number(rotation)||0);
  const batchIndex=((rawRotation%batchCount)+batchCount)%batchCount;
  return unresolved.slice(batchIndex*batchSize,(batchIndex+1)*batchSize).map(s=>s.id);
}

export async function resolveStatus(signal,price,nowMs=Date.now()) {
  if(['target_hit','stop_hit','missed_entry'].includes(signal.status)||signal.ambiguousOutcome===true)return signal;
  // A limit order whose first entry-touching 30m candle also touches TP or SL
  // cannot be proven filled-before-exit from OHLC alone. Keep it out of the
  // verified trade record instead of guessing the intrabar path.
  if(signal.status==='activation_ambiguous'&&signal.outcomeEvidence?.event==='ENTRY_AND_EXIT_SAME_CANDLE')return signal;
  const market=String(signal.market||'').toLowerCase();
  if(market!=='perpetual')return {...signal,currentPrice:price,status:['target_hit','stop_hit','missed_entry'].includes(signal.status)?'watching':signal.status||'watching',result:null,pnlPercent:null,exitPrice:null,closedAt:null,outcomeEvidence:null};
  const candles=await marketKlines(signal);
  if(!candles.length){
    const orderType=String(signal.orderType||'').toUpperCase();
    // No market data means no reliable conclusion about whether a limit filled.
    // Keep the record pending rather than falsely marking it missed.
    return {...signal,currentPrice:price,status:orderType==='MARKET'?'open':orderType==='LIMIT'?'limit_pending':signal.status||'watching'};
  }
  const livePrice=Number.isFinite(Number(price))?price:candles.at(-1)?.close??null;
  const dir=String(signal.direction||'').toUpperCase();
  if(!['LONG','SHORT'].includes(dir))return {...signal,currentPrice:price,status:'watching'};
  const order=String(signal.orderType||'').toUpperCase();
  const entry=Number(order==='LIMIT'?(signal.limitEntry??signal.entry):(signal.marketEntry??signal.currentPrice??signal.entry)),sl=Number(signal.stopLoss),tp1=Number(signal.takeProfit1);
  if(![entry,sl,tp1].every(Number.isFinite))return {...signal,currentPrice:price};
  const generatedMs=toMs(signal.generatedAt||signal.createdAt);
  if(!Number.isFinite(generatedMs))return {...signal,currentPrice:price};
  const pendingDeadline=pendingEntryDeadline(generatedMs,PENDING_ENTRY_WINDOW_MS);
  let active=false,activatedAt=toMs(signal.activatedAt);
  if(order==='MARKET'){active=true;activatedAt=Number.isFinite(activatedAt)?activatedAt:generatedMs;}
  else if(order==='LIMIT' && Number.isFinite(activatedAt))active=true;
  else if(order==='LIMIT'){
    for(const candle of candles){
      if(candle.time<generatedMs)continue;
      // Only fully closed 30m candles inside the publication window may fill
      // a pending order. A partial candle crossing the 24h deadline is not a
      // valid historical fill.
      if(!isCandleWithinWindow(candle.time,generatedMs,MONITOR_CANDLE_DURATION_MS,PENDING_ENTRY_WINDOW_MS))continue;
      const entryTouched=dir==='LONG'?candle.low<=entry&&candle.high>=entry:candle.high>=entry&&candle.low<=entry;
      const invalidated=dir==='LONG'?candle.low<=sl:candle.high>=sl;
      const targetTouched=dir==='LONG'?candle.high>=tp1:candle.low<=tp1;
      if(targetTouched&&!entryTouched)return {...signal,currentPrice:price,status:'missed_entry',result:'missed',missedAt:new Date(candle.time).toISOString(),outcomeEvidence:{source:'bybit_30m_ohlc',engineVersion:'market-engine',event:'TARGET_REACHED_BEFORE_ENTRY',candleTime:new Date(candle.time).toISOString(),note:'The structural target traded before the pending limit entry filled.'}};
      if(invalidated&&!entryTouched)return {...signal,currentPrice:price,status:'missed_entry',result:'missed',missedAt:new Date(candle.time).toISOString(),outcomeEvidence:{source:'bybit_30m_ohlc',engineVersion:'market-engine',event:'ENTRY_MISSED_INVALIDATION',candleTime:new Date(candle.time).toISOString()}};
      if(entryTouched){
        const targetTouched=dir==='LONG'?candle.high>=tp1:candle.low<=tp1;
        if(invalidated||targetTouched){
          return {...signal,currentPrice:price,status:'activation_ambiguous',result:null,pnlPercent:null,exitPrice:null,closedAt:null,
            outcomeEvidence:{source:'bybit_30m_ohlc',engineVersion:'market-engine',event:'ENTRY_AND_EXIT_SAME_CANDLE',candleTime:new Date(candle.time).toISOString(),note:'OHLC cannot prove the order of entry, stop, and target touches; excluded from verified outcomes.'}};
        }
        // Activate only after an entry-touching candle with no TP/SL touch has
        // completed. Later candles can then be evaluated without guessing.
        active=true;activatedAt=candle.time+MONITOR_CANDLE_DURATION_MS;break;
      }
    }
  } else return {...signal,currentPrice:price,status:'watching'};
  if(!active){
    const completePendingWindow=candles.length>0&&
      candles[0].time<=generatedMs+MONITOR_CANDLE_DURATION_MS&&
      candles.at(-1).time+MONITOR_CANDLE_DURATION_MS>=pendingDeadline&&
      candles.every((c,i)=>i===0||c.time-candles[i-1].time===MONITOR_CANDLE_DURATION_MS);
    if(order==='LIMIT'&&Number.isFinite(pendingDeadline)&&nowMs>=pendingDeadline&&completePendingWindow)
      return {...signal,currentPrice:price,status:'missed_entry',result:'missed',missedAt:new Date(pendingDeadline).toISOString(),outcomeEvidence:{source:'bybit_30m_ohlc',engineVersion:'market-engine',event:'LIMIT_WINDOW_EXPIRED',deadline:new Date(pendingDeadline).toISOString(),note:'Complete 30m market data confirms no valid entry fill occurred within 24 hours of publication.'}};
    return {...signal,currentPrice:price,status:order==='LIMIT'?'limit_pending':'watching'};
  }
  let ambiguous=false;
  const activationCandleStart=Math.floor(Number(activatedAt)/1800000)*1800000;
  for(const candle of candles){
    if(candle.time<activatedAt)continue;
    // A MARKET signal may be generated part-way through a 30-minute candle.
    // OHLC cannot tell whether TP/SL was touched before or after generation,
    // so the overlapping candle is excluded unless generation happened exactly at its start.
    if(candle.time===activationCandleStart&&Number(activatedAt)>candle.time)continue;
    const hitSL=dir==='LONG'?candle.low<=sl:candle.high>=sl;
    const hitTP=dir==='LONG'?candle.high>=tp1:candle.low<=tp1;
    if(hitSL&&hitTP){ambiguous=true;break;}
    if(hitSL)return {...signal,currentPrice:price,status:'stop_hit',result:'loss',exitPrice:sl,pnlPercent:dir==='LONG'?((sl-entry)/entry)*100:((entry-sl)/entry)*100,closedAt:new Date(candle.time).toISOString(),activatedAt:new Date(activatedAt).toISOString(),outcomeEvidence:{source:'bybit_30m_ohlc',engineVersion:'market-engine',event:'STOP_TOUCH',candleTime:new Date(candle.time).toISOString()}};
    if(hitTP)return {...signal,currentPrice:price,status:'target_hit',result:'win',exitPrice:tp1,pnlPercent:dir==='LONG'?((tp1-entry)/entry)*100:((entry-tp1)/entry)*100,closedAt:new Date(candle.time).toISOString(),activatedAt:new Date(activatedAt).toISOString(),outcomeEvidence:{source:'bybit_30m_ohlc',engineVersion:'market-engine',event:'TP1_TOUCH',candleTime:new Date(candle.time).toISOString()}};
  }
  return {...signal,currentPrice:livePrice,status:'open',activatedAt:new Date(activatedAt).toISOString(),ambiguousOutcome:ambiguous||undefined};
}

export default async function handler(req,res){
  if(!['GET','POST','DELETE'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
  if(req.method==='POST')return json(res,410,{error:'Individual signal creation is disabled. Setups are published centrally.'});
  try{
    const decoded=await authenticate(req);
    if(req.method==='POST')await requireActiveAccess(decoded.uid);
    const db=getAdmin().firestore(),collection=db.collection('users').doc(decoded.uid).collection('signals');
    if(req.method==='DELETE'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      if(body.signalId){
        const signalId=clean(body.signalId,200).trim();
        if(!signalId)return json(res,400,{error:'A setup id is required.'});
        const ref=collection.doc(signalId);
        const existing=await ref.get();
        if(!existing.exists)return json(res,404,{error:'Setup not found.'});
        await ref.delete();
        return json(res,200,{ok:true,deleted:1,signalId});
      }
      if(String(body.confirmation||'').trim()!=='CLEAR')return json(res,400,{error:'Type CLEAR to confirm history deletion.'});
      const snapshot=await collection.get();let deleted=0,batch=db.batch(),count=0;
      for(const doc of snapshot.docs){batch.delete(doc.ref);deleted++;count++;if(count===450){await batch.commit();batch=db.batch();count=0;}}
      if(count)await batch.commit();return json(res,200,{ok:true,deleted});
    }
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}),setup=body.setup||{},market=clean(body.market,30),symbol=clean(body.symbol,40),timeframe=clean(body.timeframe,10),entryTimeframe=clean(setup.entryTimeframe,10),strategy=clean(body.strategy||setup.strategy,30).toUpperCase().replace(/[-\s]/g,'_'),bias=clean(setup.bias,10).toUpperCase(),source=clean(body.source,40)||'live-market-analysis',scannerSetupId=clean(body.scannerSetupId,160);
      const orderType=clean(setup.orderType,20).toUpperCase();
      if(market!=='perpetual'||!symbol||!REQUEST_TIMEFRAMES.has(timeframe)||!ENTRY_TIMEFRAMES.has(entryTimeframe)||!ACTIVE_STRATEGIES.has(strategy)||!setup.tradeReady||!['LONG','SHORT'].includes(bias)||!['MARKET','LIMIT'].includes(orderType)||![setup.entry,setup.stopLoss,setup.takeProfit1].every(v=>Number.isFinite(Number(v))))return json(res,400,{error:'Only a generated, trade-ready MARKET or LIMIT setup with Entry, Stop Loss and TP1 can be recorded.'});
      const recordId=scannerSetupId?`scanner-${scannerSetupId.replace(/[^A-Z0-9_-]/gi,'-').slice(0,140)}`:null;
      const ref=recordId?collection.doc(recordId):collection.doc();
      if(recordId){const existing=await ref.get();if(existing.exists)return json(res,200,{ok:true,id:ref.id,existing:true,signal:{id:ref.id,...existing.data()}});}
      else {
        const recent=await collection.orderBy('generatedAt','desc').limit(100).get();
        const fingerprint=setupFingerprint({
          market,symbol,strategy,direction:bias,entry:setup.entry,limitEntry:setup.limitEntry,
          stopLoss:setup.stopLoss,takeProfit1:setup.takeProfit1
        });
        const duplicate=recent.docs.map(doc=>doc.data()).find(s=>setupFingerprint(s)===fingerprint);
        if(duplicate){
          const duplicateDoc=recent.docs.find(doc=>setupFingerprint(doc.data())===fingerprint);
          return json(res,200,{ok:true,id:duplicateDoc?.id||null,existing:true,duplicate:true,signal:{id:duplicateDoc?.id||null,...duplicate}});
        }
      }
      const signal={signalId:recordId?`SC-${scannerSetupId}`:`KA-${symbol.replace(/[^A-Z0-9]/gi,'').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,userId:decoded.uid,market,symbol,timeframe,strategy,engineVersion:'market-engine-v7',entryTimeframe,direction:bias,orderType,confidence:numberOrNull(setup.confidence),entry:numberOrNull(setup.entry),plannedEntry:numberOrNull(setup.plannedEntry),marketEntry:numberOrNull(setup.marketEntry),currentPrice:numberOrNull(setup.price??setup.marketEntry),limitEntry:orderType==='LIMIT'?numberOrNull(setup.limitEntry??setup.entry):null,stopLoss:numberOrNull(setup.stopLoss),takeProfit1:numberOrNull(setup.takeProfit1),takeProfit2:numberOrNull(setup.takeProfit2),riskReward:clean(setup.riskReward,40),status:bias==='WAIT'?'watching':(orderType==='LIMIT'?'limit_pending':'watching'),result:null,pnlPercent:null,exitPrice:null,closedAt:null,generatedAt:admin.firestore.FieldValue.serverTimestamp(),createdAt:admin.firestore.FieldValue.serverTimestamp(),source,scannerSetupId:scannerSetupId||null};
      await ref.set(signal);return json(res,201,{ok:true,id:ref.id,signal:{...signal,generatedAt:new Date().toISOString(),createdAt:new Date().toISOString()}});
    }
    const snapshot=await collection.orderBy('generatedAt','desc').limit(100).get(),raw=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})),signals=[];
    const currentRaw=raw.filter(s=>ACTIVE_STRATEGIES.has(String(s.strategy||'').toUpperCase())&&ENGINE_VERSIONS.has(String(s.engineVersion||''))&&REQUEST_TIMEFRAMES.has(String(s.timeframe||''))&&(!s.entryTimeframe||ENTRY_TIMEFRAMES.has(String(s.entryTimeframe))));
    const dedupedRaw=dedupeSignals(currentRaw);
    // Rotate the 24-signal verification window by minute. A fixed newest-first
    // slice starved every signal after the first 24 whenever those stayed open.
    const nowMs=Date.now();
    const resolvable=new Set(selectOutcomeBatch(dedupedRaw,24,Math.floor(nowMs/60000)));
    for(const original of dedupedRaw){
      const shouldResolve=resolvable.has(original.id);
      const resolved=shouldResolve?await resolveStatus(original,null,nowMs):original;
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
