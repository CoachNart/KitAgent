import { auth } from './firebase.js';

const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const seenKey='kitsetups-structure-events-v1';
let timer=null;
let running=false;

function seen(){try{return JSON.parse(localStorage.getItem(seenKey)||'{}')}catch{return{}}}
function save(v){try{localStorage.setItem(seenKey,JSON.stringify(v))}catch{}}
function notify(title,body,tag){if(typeof Notification==='undefined'||Notification.permission!=='granted')return;try{new Notification(title,{body,icon:'/kitsetups-logo.svg',badge:'/kitsetups-logo.svg',tag})}catch{}}
function price(v){return Number(v).toLocaleString(undefined,{maximumFractionDigits:6})}

async function poll(){
  if(running)return;
  running=true;
  try{
    const current=seen();
    await Promise.all(SYMBOLS.map(async symbol=>{
      try{
        const r=await fetch(`/api/market-alerts?symbol=${symbol}`,{cache:'no-store'});
        if(!r.ok)return;
        const data=await r.json(),event=data?.structure?.event;
        if(!event)return;
        const key=`${symbol}-${event.direction}-${event.time}`;
        if(current[key])return;
        current[key]=Date.now();
        notify(`${symbol.replace('USDT','')} ${event.direction==='bullish'?'bullish':'bearish'} structure`,`${event.type}: 5m closed through a confirmed swing level.`,key);
      }catch{}
    }));
    const cutoff=Date.now()-7*86400000;for(const [k,v] of Object.entries(current))if(v<cutoff)delete current[k];save(current);
  }finally{running=false}
}

export function startMarketAlerts(){
  if(typeof window==='undefined'||timer)return;
  const begin=()=>{poll();timer=window.setInterval(poll,60000)};
  if(auth)auth.onAuthStateChanged(user=>{if(user)begin()});else timer=window.setInterval(poll,60000);
}
