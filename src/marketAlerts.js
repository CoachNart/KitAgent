import { auth } from './firebase.js';

const BYBIT_BASE='https://api.bytick.com';
const NEWS_URL='https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const POLL_MS=60_000;
const UNIVERSE_REFRESH_MS=15*60_000;
const MAJOR_PAIR_COUNT=15;
const EARLY_INTERVAL='5';
const CONFIRM_INTERVAL='15';
const seenKey='kitsetups-structure-events-v4';
const newsKey='kitsetups-news-events-v4';
const pendingKey='kitsetups-pending-structure-v1';
let timer=null;
let running=false;
let symbolsCache=[];
let symbolsCacheAt=0;
let snapshot={running:false,source:'Bybit',timeframe:'5m → 15m',checkedAt:0,markets:[],news:[],lastEvent:null,lastConfirmed:null,error:null};

function read(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}}
function save(key,v){try{localStorage.setItem(key,JSON.stringify(v))}catch{}}
function emit(){try{window.dispatchEvent(new CustomEvent('kitagent:market-alert-update',{detail:snapshot}))}catch{}}
function notify(title,body,tag){if(typeof Notification==='undefined'||Notification.permission!=='granted')return;try{new Notification(title,{body,icon:'/kitsetups-logo.svg',badge:'/kitsetups-logo.svg',tag})}catch{}}

function candles(rows){return Array.isArray(rows)?rows.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4])})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time):[]}
function pivots(c){const highs=[],lows=[];for(let i=2;i<c.length-2;i++){const x=c[i];if(x.high>c[i-1].high&&x.high>=c[i+1].high&&x.high>c[i-2].high&&x.high>=c[i+2].high)highs.push({price:x.high,time:x.time,index:i});if(x.low<c[i-1].low&&x.low<=c[i+1].low&&x.low<c[i-2].low&&x.low<=c[i+2].low)lows.push({price:x.low,time:x.time,index:i})}return{highs,lows}}
function structure(c){if(c.length<30)return{event:null};const{highs,lows}=pivots(c),hs=highs.slice(-3),ls=lows.slice(-3);if(hs.length<2||ls.length<2)return{event:null};const last=c.at(-1),prev=c.at(-2),prevHigh=hs.at(-1),prevLow=ls.at(-1);let event=null;if(last.close>prevHigh.price&&prev.close<=prevHigh.price)event={direction:'bullish',type:'BOS',level:prevHigh.price,time:last.time};if(last.close<prevLow.price&&prev.close>=prevLow.price)event={direction:'bearish',type:'BOS',level:prevLow.price,time:last.time};return{event}}

async function bybitJson(path,params={}){const u=new URL(`${BYBIT_BASE}${path}`);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`Bybit HTTP ${r.status}`);const body=await r.json();if(body?.retCode!==0)throw new Error(`Bybit ${body?.retCode||'request failed'}: ${body?.retMsg||'unknown error'}`);return body}

async function getMajorSymbols(){const now=Date.now();if(symbolsCache.length&&now-symbolsCacheAt<UNIVERSE_REFRESH_MS)return symbolsCache;const body=await bybitJson('/v5/market/tickers',{category:'linear'});const list=Array.isArray(body?.result?.list)?body.result.list:[];const ranked=list.filter(x=>x?.symbol?.endsWith('USDT')&&x?.contractType==='LinearPerpetual'&&x?.status==='Trading').map(x=>({symbol:x.symbol,turnover:Number(x.turnover24h)||0})).filter(x=>x.turnover>0).sort((a,b)=>b.turnover-a.turnover).slice(0,MAJOR_PAIR_COUNT).map(x=>x.symbol);if(!ranked.length)throw new Error('Bybit returned no major USDT perpetual pairs');symbolsCache=ranked;symbolsCacheAt=now;return ranked}
async function market(symbol,interval){const body=await bybitJson('/v5/market/kline',{category:'linear',symbol,interval,limit:150});const rows=body?.result?.list;if(!Array.isArray(rows)||rows.length<30)throw new Error('Bybit returned insufficient candle data');return candles(rows.slice(1))}

function parseNewsTime(item){if(Number.isFinite(Number(item?.timestamp)))return Number(item.timestamp)*1000;if(item?.date&&item?.time){const d=String(item.date).trim(),t=String(item.time).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(d)){const n=Date.parse(`${d} ${t}`);if(Number.isFinite(n))return n}const m=d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);if(m){const n=Date.parse(`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')} ${t} UTC`);if(Number.isFinite(n))return n}}return null}
async function news(){const r=await fetch(NEWS_URL,{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`Calendar ${r.status}`);const data=await r.json(),now=Date.now();return(Array.isArray(data)?data:[]).map((x,i)=>({...x,id:String(x.id||`${x.date||''}-${x.time||''}-${x.title||''}-${i}`),when:parseNewsTime(x)})).filter(x=>String(x.impact||'').toLowerCase()==='high'&&x.when&&x.when>now-300000&&x.when<now+7*86400000).sort((a,b)=>a.when-b.when)}

async function poll(){if(running)return;running=true;const now=Date.now();snapshot={...snapshot,running:true,checkedAt:now,error:null};emit();try{const seen=read(seenKey),newsSeen=read(newsKey),pending=read(pendingKey);const symbols=await getMajorSymbols();const marketResults=[];for(const symbol of symbols){try{const[fast,confirm]=await Promise.all([market(symbol,EARLY_INTERVAL),market(symbol,CONFIRM_INTERVAL)]);const early=structure(fast).event,confirmed=structure(confirm).event,fastLast=fast.at(-1);marketResults.push({symbol,price:fastLast?.close||null,early,confirmed,ok:true})}catch(e){marketResults.push({symbol,price:null,early:null,confirmed:null,ok:false,error:e?.message||'Bybit request failed'})}}
let lastEvent=snapshot.lastEvent,lastConfirmed=snapshot.lastConfirmed;for(const result of marketResults){const{symbol,early,confirmed}=result;if(early){const earlyKey=`${symbol}-${early.direction}-${early.time}`;pending[symbol]={direction:early.direction,time:early.time,level:early.level,detectedAt:now};if(!seen[earlyKey]){seen[earlyKey]=now;lastEvent={...early,symbol,detectedAt:now,timeframe:'5m'};notify(`${symbol.replace('USDT','')} 5m structure shift`,`${early.type}: ${early.direction} break detected. Waiting for 15m confirmation.`,earlyKey)}}if(confirmed){const candidate=pending[symbol],age=candidate?now-Number(candidate.detectedAt):Infinity,matches=candidate&&candidate.direction===confirmed.direction&&age>=0&&age<=6*60*60*1000;if(matches){const key=`${symbol}-${confirmed.direction}-15m-${confirmed.time}`;if(!seen[key]){seen[key]=now;lastConfirmed={...confirmed,symbol,detectedAt:now,timeframe:'15m'};notify(`${symbol.replace('USDT','')} ${confirmed.direction} structure confirmed`,`15m BOS confirms the 5m ${confirmed.direction} structure shift.`,key)}delete pending[symbol]}}}
let upcoming=[];try{upcoming=await news();for(const item of upcoming){const mins=Math.round((Number(item.when)-now)/60000);if(mins<10||mins>30)continue;const key=`${item.id}-${Math.floor(Number(item.when)/600000)}`;if(newsSeen[key])continue;newsSeen[key]=now;notify(`HIGH IMPACT — ${item.country||'Market'}`,`${item.title||'Major economic release'} in about ${mins} min. Expect elevated volatility.`,key)}}catch(e){console.warn('[alerts] news check failed',e?.message||e)}
const cutoff=now-7*86400000;for(const[k,v]of Object.entries(seen))if(v<cutoff)delete seen[k];for(const[k,v]of Object.entries(newsSeen))if(v<cutoff)delete newsSeen[k];for(const[k,v]of Object.entries(pending))if(now-Number(v.detectedAt)>6*60*60*1000)delete pending[k];save(seenKey,seen);save(newsKey,newsSeen);save(pendingKey,pending);snapshot={running:false,source:'Bybit via api.bytick.com',timeframe:'5m → 15m',checkedAt:now,markets:marketResults,news:upcoming.slice(0,8).map(x=>({id:x.id,title:x.title,country:x.country,when:x.when,impact:x.impact})),lastEvent,lastConfirmed,error:marketResults.some(x=>!x.ok)?'Some major Bybit pairs could not be checked.':null};emit()}catch(e){snapshot={...snapshot,running:false,checkedAt:now,error:e?.message||'Alert monitor failed'};emit()}finally{running=false}}

export function startMarketAlerts(){if(typeof window==='undefined'||timer)return;const begin=()=>{if(typeof Notification!=='undefined'&&Notification.permission==='default')Notification.requestPermission().catch(()=>{});snapshot={...snapshot,running:true};emit();poll();timer=window.setInterval(poll,POLL_MS)};if(auth)auth.onAuthStateChanged(user=>{if(user)begin()});else begin()}
export function getMarketAlertSnapshot(){return snapshot}
