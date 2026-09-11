import { auth } from './firebase.js';

const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const INTERVAL='5';
const BYBIT_URL='https://api.bybit.com/v5/market/kline';
const NEWS_URL='https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const POLL_MS=60_000;
const seenKey='kitsetups-structure-events-v2';
const newsKey='kitsetups-news-events-v2';
let timer=null;
let running=false;

function read(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}}
function save(key,v){try{localStorage.setItem(key,JSON.stringify(v))}catch{}}
function notify(title,body,tag){if(typeof Notification==='undefined'||Notification.permission!=='granted')return;try{new Notification(title,{body,icon:'/kitsetups-logo.svg',badge:'/kitsetups-logo.svg',tag})}catch{}}

function candles(rows){
  return Array.isArray(rows)?rows.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4])})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time):[];
}

function pivots(c){
  const highs=[],lows=[];
  for(let i=2;i<c.length-2;i++){
    const x=c[i];
    if(x.high>c[i-1].high&&x.high>=c[i+1].high&&x.high>c[i-2].high&&x.high>=c[i+2].high)highs.push({price:x.high,time:x.time,index:i});
    if(x.low<c[i-1].low&&x.low<=c[i+1].low&&x.low<c[i-2].low&&x.low<=c[i+2].low)lows.push({price:x.low,time:x.time,index:i});
  }
  return{highs,lows};
}

function structure(c){
  if(c.length<30)return{event:null};
  const{highs,lows}=pivots(c),hs=highs.slice(-3),ls=lows.slice(-3);
  if(hs.length<2||ls.length<2)return{event:null};
  const last=c.at(-1),prev=c.at(-2),prevHigh=hs.at(-1),prevLow=ls.at(-1);
  let event=null;
  if(last.close>prevHigh.price&&prev.close<=prevHigh.price)event={direction:'bullish',type:'BOS',level:prevHigh.price,time:last.time};
  if(last.close<prevLow.price&&prev.close>=prevLow.price)event={direction:'bearish',type:'BOS',level:prevLow.price,time:last.time};
  return{event};
}

async function market(symbol){
  const u=new URL(BYBIT_URL);
  u.searchParams.set('category','linear');
  u.searchParams.set('symbol',symbol);
  u.searchParams.set('interval',INTERVAL);
  u.searchParams.set('limit','150');
  const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
  if(!r.ok)throw new Error(`Bybit ${r.status}`);
  const body=await r.json();
  if(body?.retCode!==0)throw new Error(`Bybit ${body?.retCode||'request failed'}`);
  return candles(body?.result?.list?.slice(1)||[]);
}

function parseNewsTime(item){
  if(Number.isFinite(Number(item?.timestamp)))return Number(item.timestamp)*1000;
  if(item?.date&&item?.time){
    const d=String(item.date).trim(),t=String(item.time).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)){const n=Date.parse(`${d} ${t}`);if(Number.isFinite(n))return n;}
    const m=d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if(m){const n=Date.parse(`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')} ${t} UTC`);if(Number.isFinite(n))return n;}
  }
  return null;
}

async function news(){
  const r=await fetch(NEWS_URL,{headers:{Accept:'application/json','User-Agent':'KitAgent/1.0'},cache:'no-store'});
  if(!r.ok)throw new Error(`Calendar ${r.status}`);
  const data=await r.json(),now=Date.now();
  return(Array.isArray(data)?data:[]).map((x,i)=>({...x,id:String(x.id||`${x.date||''}-${x.time||''}-${x.title||''}-${i}`),when:parseNewsTime(x)})).filter(x=>String(x.impact||'').toLowerCase()==='high'&&x.when&&x.when>now-300000&&x.when<now+7*86400000).sort((a,b)=>a.when-b.when);
}

async function poll(){
  if(running)return;
  running=true;
  try{
    const current=read(seenKey),newsSeen=read(newsKey),now=Date.now();
    await Promise.all(SYMBOLS.map(async symbol=>{
      try{
        const event=structure(await market(symbol)).event;
        if(event){
          const key=`${symbol}-${event.direction}-${event.time}`;
          if(!current[key]){
            current[key]=now;
            notify(`${symbol.replace('USDT','')} ${event.direction==='bullish'?'bullish':'bearish'} structure`,`${event.type}: 5m closed through a confirmed swing level.`,key);
          }
        }
      }catch(e){console.warn('[alerts] market check failed',symbol,e?.message||e)}
    }));

    try{
      for(const item of await news()){
        const mins=Math.round((Number(item.when)-now)/60000);
        if(mins<10||mins>30)continue;
        const key=`${item.id}-${Math.floor(Number(item.when)/600000)}`;
        if(newsSeen[key])continue;
        newsSeen[key]=now;
        notify(`HIGH IMPACT — ${item.country||'Market'}`,`${item.title||'Major economic release'} in about ${mins} min. Expect elevated volatility.`,key);
      }
    }catch(e){console.warn('[alerts] news check failed',e?.message||e)}

    const cutoff=now-7*86400000;
    for(const[k,v]of Object.entries(current))if(v<cutoff)delete current[k];
    for(const[k,v]of Object.entries(newsSeen))if(v<cutoff)delete newsSeen[k];
    save(seenKey,current);save(newsKey,newsSeen);
  }finally{running=false}
}

export function startMarketAlerts(){
  if(typeof window==='undefined'||timer)return;
  const begin=()=>{
    if(typeof Notification!=='undefined'&&Notification.permission==='default'){
      Notification.requestPermission().catch(()=>{});
    }
    poll();
    timer=window.setInterval(poll,POLL_MS);
  };
  if(auth)auth.onAuthStateChanged(user=>{if(user)begin()});
  else begin();
}
