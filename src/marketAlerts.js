import { auth } from './firebase.js';

const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const seenKey='kitsetups-structure-events-v1';
const newsKey='kitsetups-news-events-v1';
let timer=null;
let running=false;

function read(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}}
function save(key,v){try{localStorage.setItem(key,JSON.stringify(v))}catch{}}
function notify(title,body,tag){if(typeof Notification==='undefined'||Notification.permission!=='granted')return;try{new Notification(title,{body,icon:'/kitsetups-logo.svg',badge:'/kitsetups-logo.svg',tag})}catch{}}

async function poll(){
  if(running)return;
  running=true;
  try{
    const current=read(seenKey),newsSeen=read(newsKey),now=Date.now();
    await Promise.all(SYMBOLS.map(async symbol=>{
      try{
        const r=await fetch(`/api/market-alerts?symbol=${symbol}`,{cache:'no-store'});
        if(!r.ok)return;
        const data=await r.json(),event=data?.structure?.event;
        if(event){
          const key=`${symbol}-${event.direction}-${event.time}`;
          if(!current[key]){current[key]=now;notify(`${symbol.replace('USDT','')} ${event.direction==='bullish'?'bullish':'bearish'} structure`,`${event.type}: 5m closed through a confirmed swing level.`,key)}
        }
        if(symbol==='BTCUSDT'){
          for(const item of Array.isArray(data?.news)?data.news:[]){
            const mins=Math.round((Number(item.when)-now)/60000);
            if(mins<10||mins>30)continue;
            const key=`${item.id}-${Math.floor(Number(item.when)/600000)}`;
            if(newsSeen[key])continue;
            newsSeen[key]=now;
            notify(`HIGH IMPACT — ${item.country||'Market'}`,`${item.title||'Major economic release'} in about ${mins} min. Expect elevated volatility.`,key);
          }
        }
      }catch{}
    }));
    const cutoff=now-7*86400000;for(const [k,v] of Object.entries(current))if(v<cutoff)delete current[k];for(const [k,v] of Object.entries(newsSeen))if(v<cutoff)delete newsSeen[k];save(seenKey,current);save(newsKey,newsSeen);
  }finally{running=false}
}

export function startMarketAlerts(){
  if(typeof window==='undefined'||timer)return;
  const begin=()=>{poll();timer=window.setInterval(poll,60000)};
  if(auth)auth.onAuthStateChanged(user=>{if(user)begin()});else timer=window.setInterval(poll,60000);
}
