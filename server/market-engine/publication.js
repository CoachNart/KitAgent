import admin from 'firebase-admin';
import fs from 'node:fs';
import { authenticate, requireActiveAccess } from '../access.js';
import { scanTopQuality } from './daily.js';
import { isCandleWithinWindow } from './execution-window.js';

const BOARD_DOC='daily',BOARD_WINDOW_MS=24*60*60*1000,REFRESH_MS=60*1000,CANDLE_MS=30*60*1000;
function getAdmin(){
  if(admin.apps.length)return admin;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON,path=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(raw){admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['"]|['"]$/g,'')))});return admin;}
  if(path&&fs.existsSync(path)){admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(path,'utf8')))});return admin;}
  throw Object.assign(new Error('Firebase Admin credentials are missing.'),{code:'FIREBASE_ADMIN_CREDENTIALS_MISSING'});
}
const db=()=>getAdmin().firestore();
const ms=v=>v?.toMillis?v.toMillis():v?.toDate?v.toDate().getTime():typeof v==='number'?v:Date.parse(v||'')||0;
const json=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');res.end(JSON.stringify(body));};
const cleanId=v=>String(v||'').replace(/[^A-Z0-9_-]/gi,'-').slice(0,140);
async function candlesSince(symbol,startMs){
  const all=[];let end=Date.now(),pages=0;
  while(end>=startMs&&pages<12){
    let lastError='';
    let rows=null;
    for(const host of ['https://api.bybit.com','https://api.bytick.com']){
      try{
        const u=new URL('/v5/market/kline',host);
        u.searchParams.set('category','linear');u.searchParams.set('symbol',symbol);
        u.searchParams.set('interval','30');u.searchParams.set('start',String(startMs));
        u.searchParams.set('end',String(end));u.searchParams.set('limit','1000');
        const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
        if(!r.ok){lastError='Bybit candles HTTP '+r.status;continue;}
        const b=await r.json();
        if(b?.retCode!==0){lastError='Bybit candles retCode '+b?.retCode;continue;}
        rows=(b.result?.list||[]).slice().reverse().map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4])}))
          .filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite));
        break;
      }catch(e){lastError=e?.message||String(e);}
    }
    if(!rows)throw new Error(lastError||'Bybit candles unavailable');
    if(!rows.length)break;
    all.push(...rows);
    const oldest=rows[0].time;
    if(oldest<=startMs||rows.length<1000)break;
    end=oldest-1;pages++;
  }
  return [...new Map(all.map(x=>[x.time,x])).values()].filter(x=>x.time>=startMs&&x.time+CANDLE_MS<=Date.now()).sort((a,b)=>a.time-b.time);
}
function touched(c,price){return c.low<=price&&c.high>=price;}
function isLong(s){return String(s.bias||'').toUpperCase()==='LONG';}
function levels(s){return{entry:Number(s.entry),stop:Number(s.stopLoss),target:Number(s.takeProfit)};}
async function refreshTrade(doc){
  const data=doc.data(),now=Date.now(),last=ms(data.lastCheckedAt);
  if(last&&now-last<REFRESH_MS)return{...data,id:doc.id};
  const symbol=String(data.providerSymbol||'').replace(/[^A-Z0-9]/gi,'');
  const start=ms(data.publishedAt||data.createdAt);
  if(!symbol||!start)return{...data,id:doc.id};
  const {entry,stop,target}=levels(data);
  if(![entry,stop,target].every(Number.isFinite))return data;
  const long=isLong(data),order=String(data.orderType||'MARKET').toUpperCase();
  const pendingExpiresAt=ms(data.pendingExpiresAt)||start+BOARD_WINDOW_MS;
  const pendingWindowMs=Math.max(0,pendingExpiresAt-start);
  const candles=await candlesSince(symbol,start);
  if(!candles.length){await doc.ref.set({lastCheckedAt:new Date(now)},{merge:true});return{...data,id:doc.id};}
  let status=String(data.status||'PENDING_ENTRY'),activatedAt=ms(data.activatedAt),reason=data.statusReason||null,exitCandle=null;
  if(order==='LIMIT'&&status==='PENDING_ENTRY'){
    for(const c of candles){
      if(!isCandleWithinWindow(c.time,start,CANDLE_MS,pendingWindowMs)){
        if(c.time>=pendingExpiresAt)break;
        continue;
      }
      const entryHit=touched(c,entry),stopHit=long?c.low<=stop:c.high>=stop,targetHit=long?c.high>=target:c.low<=target;
      if(!entryHit&&stopHit){status='INVALIDATED';reason='The stop/invalidation level was reached before the limit entry filled.';break;}
      if(!entryHit&&targetHit){status='MISSED_ENTRY';reason='Price reached the target area without filling the planned limit entry.';break;}
      if(entryHit){
        if(stopHit||targetHit){status='INVALIDATED';reason='Entry and an exit level were touched in the same 30-minute candle; execution order cannot be verified safely.';break;}
        status='ACTIVE';activatedAt=c.time+CANDLE_MS;reason='Limit entry confirmed by a completed Bybit 30-minute candle.';break;
      }
    }
    if(status==='PENDING_ENTRY'&&now>=pendingExpiresAt){status='MISSED_ENTRY';reason='The 24-hour window from the original liquidity sweep ended without a confirmed limit fill.';}
  }
  if(order==='MARKET'&&!['TARGET_HIT','STOP_HIT'].includes(status)){status='ACTIVE';activatedAt=activatedAt||start;}
  if(status==='ACTIVE'){
    for(const c of candles){
      if(c.time<activatedAt)continue;
      if(c.time===Math.floor(activatedAt/CANDLE_MS)*CANDLE_MS&&activatedAt>c.time)continue;
      const stopHit=long?c.low<=stop:c.high>=stop,targetHit=long?c.high>=target:c.low<=target;
      if(stopHit&&targetHit){reason='Both stop and target were touched in one candle. Outcome is ambiguous and will not be guessed.';break;}
      if(stopHit){status='STOP_HIT';exitCandle=c;reason='Stop loss reached on Bybit 30-minute OHLC data.';break;}
      if(targetHit){status='TARGET_HIT';exitCandle=c;reason='Take profit reached on Bybit 30-minute OHLC data.';break;}
    }
  }
  const patch={status,statusReason:reason,lastCheckedAt:new Date(now),updatedAt:new Date(now),currentPrice:candles.at(-1).close};
  if(activatedAt)patch.activatedAt=new Date(activatedAt);
  if(['TARGET_HIT','STOP_HIT'].includes(status)&&exitCandle){
    const exitPrice=status==='TARGET_HIT'?target:stop;
    patch.closedAt=new Date(exitCandle.time+CANDLE_MS);patch.exitPrice=exitPrice;patch.result=status==='TARGET_HIT'?'win':'loss';
    patch.pnlPercent=long?((exitPrice-entry)/entry)*100:((entry-exitPrice)/entry)*100;
    patch.outcomeEvidence={source:'bybit_30m_ohlc',event:status,candleTime:new Date(exitCandle.time).toISOString(),candleResolution:'30m OHLC; ambiguous dual-touch candles are not classified'};
  }
  await doc.ref.set(patch,{merge:true});
  return{...data,...patch,id:doc.id};
}
export async function publishDailyBoard(){
  const database=db(),metaRef=database.collection('marketPublications').doc(BOARD_DOC),now=Date.now();
  return database.runTransaction(async tx=>{
    const snap=await tx.get(metaRef),current=snap.exists?snap.data():null;
    if(current&&current.status!=='FAILED'&&ms(current.publishedAt)>0&&now-ms(current.publishedAt)<BOARD_WINDOW_MS)
      return{published:false,reason:'BOARD_STILL_ACTIVE',publicationId:current.publicationId||null};
    if(current?.scanningAt&&now-ms(current.scanningAt)<15*60*1000)return{published:false,reason:'SCAN_IN_PROGRESS',publicationId:current.publicationId||null};
    const publicationId=new Date(now).toISOString().slice(0,10)+'-'+String(now);
    tx.set(metaRef,{status:'SCANNING',scanningAt:new Date(now),source:'Bybit linear perpetuals',updatedAt:new Date(now)},{merge:true});
    return{published:true,publicationId,previousPublicationId:current?.publicationId||null};
  }).then(async reservation=>{
    if(!reservation.published)return reservation;
    try{
      const result=await scanTopQuality();
      const setups=(result.setups||[]).slice(0,5);
      const writes=database.batch();
      for(const s of setups){
        const orderType=String(s.orderType||'MARKET').toUpperCase();
        const id=database.collection('marketSetups').doc();
        writes.set(id,{
          publicationId:reservation.publicationId,sourceSetupId:cleanId(s.id),symbol:s.symbol,providerSymbol:s.providerSymbol,
          strategy:s.strategy,strategyKey:s.strategyKey,model:s.model||'LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG',analysisTimeframes:['4H','1H'],bias:s.bias,timeframe:s.timeframe,grade:s.grade,qualityScore:s.score,
          confidence:s.confidence,entry:Number(s.entry),plannedEntry:s.plannedEntry??null,orderType,
          marketEntry:Number(s.marketEntry),stopLoss:Number(s.stopLoss),takeProfit:Number(s.takeProfit),
          rr:Number(s.rr),regime:s.regime,evidence:s.evidence||[],layers:s.layers||[],targetSource:s.targetSource||null,
          targetSelection:s.targetSelection||null,entryReason:s.entryReason||null,
          status:orderType==='MARKET'?'ACTIVE':'PENDING_ENTRY',
          statusReason:orderType==='MARKET'?'Market setup activated at publication.':'Waiting for a confirmed limit fill.',
          publishedAt:new Date(now),createdAt:new Date(now),updatedAt:new Date(now),activatedAt:orderType==='MARKET'?new Date(now):null,
          lastCheckedAt:null,source:'Bybit linear perpetuals',engineVersion:'market-engine-v8-unified-4h-1h'
        });
      }
      await writes.commit();
      if(reservation.previousPublicationId){
        const old=await database.collection('marketSetups')
          .where('publicationId','==',reservation.previousPublicationId).limit(450).get();
        const archiveable=old.docs.filter(d=>['PENDING_ENTRY','INVALIDATED','MISSED_ENTRY'].includes(d.data()?.status));
        if(archiveable.length){
          const archiveBatch=database.batch();
          archiveable.forEach(d=>archiveBatch.set(d.ref,{status:'ARCHIVED',archivedAt:new Date(now),statusReason:'The previous daily board has reset.'},{merge:true}));
          await archiveBatch.commit();
        }
      }
      await metaRef.set({publicationId:reservation.publicationId,publishedAt:new Date(now),resetsAt:new Date(now+BOARD_WINDOW_MS),status:'PUBLISHED',scanningAt:null,setupCount:setups.length,scanUniverse:result.scanUniverse||0,model:result.model||'LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG',analysisTimeframes:['4H','1H'],diagnostics:result.diagnostics||null,updatedAt:new Date()},{merge:true});
      return{published:true,publicationId:reservation.publicationId,setupCount:setups.length,scanUniverse:result.scanUniverse||0};
    }catch(error){
      await metaRef.set({status:'FAILED',scanningAt:null,error:String(error?.message||error),updatedAt:new Date()},{merge:true});
      throw error;
    }
  });
}
async function refreshCurrentTrades(){
  const snap=await db().collection('marketSetups').where('status','in',['PENDING_ENTRY','ACTIVE']).limit(500).get();
  const output=[];
  for(let i=0;i<snap.docs.length;i+=10){
    const group=snap.docs.slice(i,i+10);
    const resolved=await Promise.all(group.map(async doc=>{
      try{return await refreshTrade(doc);}
      catch(error){await doc.ref.set({lastCheckError:String(error?.message||error),lastCheckedAt:new Date()},{merge:true});return{...doc.data(),id:doc.id};}
    }));
    output.push(...resolved);
  }
  return output;
}
async function authorized(req){const user=await authenticate(req);const access=await requireActiveAccess(user.uid);return{user,access};}
export async function dailySetupsHandler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'Method not allowed. Daily publication is managed centrally.'});
  try{
    await authorized(req);
    await refreshCurrentTrades();
    const metaSnap=await db().collection('marketPublications').doc(BOARD_DOC).get(),meta=metaSnap.exists?metaSnap.data():{};
    const boardSnap=meta.publicationId?await db().collection('marketSetups').where('publicationId','==',meta.publicationId).limit(10).get():null;
    const boardRows=boardSnap?boardSnap.docs.map(d=>({id:d.id,...d.data()})):[];
    const current=boardRows.filter(x=>['PENDING_ENTRY','INVALIDATED','MISSED_ENTRY'].includes(x.status));
    const recentChanges=boardRows.filter(x=>['ACTIVE','INVALIDATED','MISSED_ENTRY','TARGET_HIT','STOP_HIT'].includes(x.status));
    return json(res,200,{ok:true,setups:current.sort((a,b)=>ms(b.publishedAt)-ms(a.publishedAt)),recentChanges,publicationId:meta.publicationId||null,publishedAt:meta.publishedAt||null,resetsAt:meta.resetsAt||null,setupCount:Number(meta.setupCount)||0,scanUniverse:Number(meta.scanUniverse)||0,source:'Bybit linear perpetuals',model:meta.model||'LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG',analysisTimeframes:meta.analysisTimeframes||['4H','1H'],status:meta.status||'WAITING'});
  }catch(error){const status=error?.code==='AUTH_REQUIRED'||error?.code==='AUTH_INVALID'?401:error?.code==='ACCESS_EXPIRED'?403:500;return json(res,status,{ok:false,error:error?.message||'Daily setups could not be loaded.'});}
}
export async function tradesHandler(view,req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'Method not allowed.'});
  try{
    await authorized(req);
    const refreshed=await refreshCurrentTrades();
    let rows=[];
    if(view==='active'){
      rows=refreshed.filter(x=>x.status==='ACTIVE');
    }else{
      const snap=await db().collection('marketSetups').where('status','in',['TARGET_HIT','STOP_HIT']).limit(100).get();
      rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    }
    rows.sort((a,b)=>ms(b.activatedAt||b.publishedAt)-ms(a.activatedAt||a.publishedAt));
    const recentSnap=await db().collection('marketSetups').where('updatedAt','>=',new Date(Date.now()-BOARD_WINDOW_MS)).limit(100).get();
    const recentChanges=recentSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>['ACTIVE','INVALIDATED','MISSED_ENTRY','TARGET_HIT','STOP_HIT'].includes(x.status));
    return json(res,200,{ok:true,trades:rows,recentChanges,source:'Bybit linear perpetuals'});
  }catch(error){const status=error?.code==='AUTH_REQUIRED'||error?.code==='AUTH_INVALID'?401:error?.code==='ACCESS_EXPIRED'?403:500;return json(res,status,{ok:false,error:error?.message||'Trade records could not be loaded.'});}
}
export async function cronHandler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'Method not allowed.'});
  const secret=process.env.CRON_SECRET;
  if(!secret||String(req.headers.authorization||'')!=='Bearer '+secret)return json(res,401,{ok:false,error:'Unauthorized cron request.'});
  try{return json(res,200,{ok:true,...await publishDailyBoard()});}
  catch(error){return json(res,500,{ok:false,error:error?.message||'Daily publication failed.'});}
}
