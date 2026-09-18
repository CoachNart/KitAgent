#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';

const BYBIT_BASE = 'https://api.bybit.com';
const SYMBOL_LIMIT = 5;
const INTERVAL = '5';
const LOOKBACK = 150;
const POLL_MS = 5 * 60 * 1000;
const BRIDGE_PORT = Number(process.env.KITSETUPS_ALERT_PORT || 17873);
const STATE_FILE = process.env.KITSETUPS_ALERT_STATE || `${homedir()}/.kitsetups-market-alerts.json`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let latestEvent = null;
let lastCheckAt = null;
let lastError = null;

const bridge = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'GET') { res.writeHead(405); return res.end('Method not allowed'); }
  const body = JSON.stringify({
    ok: true,
    monitor: 'kitsetups-termux',
    checkedAt: lastCheckAt,
    error: lastError,
    event: latestEvent,
  });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
});

bridge.listen(BRIDGE_PORT, '127.0.0.1', () => {
  console.log(`[market-alerts] Local KitSetups bridge: http://127.0.0.1:${BRIDGE_PORT}/`);
});

async function bybitJson(path, params = {}) {
  const url = new URL(`${BYBIT_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'KitSetups-Termux-MarketMonitor/1.1' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);
  const body = await response.json();
  if (body?.retCode !== 0) throw new Error(body?.retMsg || 'Bybit request failed');
  return body;
}

function candles(rows) {
  return (Array.isArray(rows) ? rows.slice(1).reverse() : [])
    .map(row => ({ time:Number(row[0]), open:Number(row[1]), high:Number(row[2]), low:Number(row[3]), close:Number(row[4]) }))
    .filter(c => [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite));
}

function pivotHigh(c,i) {
  if (i < 2 || i >= c.length - 2) return false;
  return c[i].high > c[i-1].high && c[i].high >= c[i+1].high && c[i].high > c[i-2].high && c[i].high >= c[i+2].high;
}
function pivotLow(c,i) {
  if (i < 2 || i >= c.length - 2) return false;
  return c[i].low < c[i-1].low && c[i].low <= c[i+1].low && c[i].low < c[i-2].low && c[i].low <= c[i+2].low;
}

function latestStructureEvent(c) {
  if (c.length < 30) return null;
  const highs=[], lows=[];
  for (let i=2;i<c.length-2;i++) {
    if (pivotHigh(c,i)) highs.push({price:c[i].high,index:i});
    if (pivotLow(c,i)) lows.push({price:c[i].low,index:i});
  }
  const last=c.at(-1), previous=c.at(-2), high=highs.at(-1), low=lows.at(-1);
  if (!last || !previous) return null;
  if (high && previous.close <= high.price && last.close > high.price) return {direction:'LONG',type:'BOS',level:high.price,candleTime:last.time};
  if (low && previous.close >= low.price && last.close < low.price) return {direction:'SHORT',type:'BOS',level:low.price,candleTime:last.time};
  return null;
}

async function getSymbols() {
  const body=await bybitJson('/v5/market/tickers',{category:'linear'});
  return (Array.isArray(body?.result?.list)?body.result.list:[])
    .filter(item=>item?.symbol?.endsWith('USDT'))
    .map(item=>({symbol:item.symbol,turnover:Number(item.turnover24h)||0}))
    .filter(item=>item.turnover>0)
    .sort((a,b)=>b.turnover-a.turnover)
    .slice(0,SYMBOL_LIMIT)
    .map(item=>item.symbol);
}

async function inspect(symbol) {
  try {
    const body=await bybitJson('/v5/market/kline',{category:'linear',symbol,interval:INTERVAL,limit:LOOKBACK});
    const c=candles(body?.result?.list);
    const event=latestStructureEvent(c);
    return event ? {...event,symbol} : null;
  } catch(error) {
    console.warn(`[market-alerts] ${symbol}: ${error?.message||error}`);
    return null;
  }
}

async function loadState() {
  try {
    const parsed=JSON.parse(await readFile(STATE_FILE,'utf8'));
    return parsed && typeof parsed==='object' ? parsed : {};
  } catch { return {}; }
}
async function saveState(state) { await writeFile(STATE_FILE,JSON.stringify(state,null,2),'utf8'); }

function formatPrice(value) {
  const n=Number(value);
  if(!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined,{maximumFractionDigits:n<10?6:2})}`;
}

async function notify(event) {
  const title=`${event.symbol.replace('USDT','')} ${event.direction} structure`;
  const content=`5m BOS detected at ${formatPrice(event.level)}`;
  try {
    const {execFile}=await import('node:child_process');
    await new Promise((resolve,reject)=>{
      execFile('termux-notification',[
        '--id',`kitsetups-${event.symbol}-${event.direction}`,
        '--title',title,'--content',content,'--priority','high','--sound',
        '--vibrate','300,200,300'
      ],error=>error?reject(error):resolve());
    });
    return true;
  } catch(error) {
    console.warn('[market-alerts] Android notification unavailable.');
    console.warn('Install Termux:API plus the termux-api package if needed.');
    console.warn(error?.message||error);
    return false;
  }
}

async function checkOnce() {
  lastCheckAt = new Date().toISOString();
  lastError = null;
  const symbols=await getSymbols();
  if(!symbols.length) throw new Error('Bybit returned no USDT perpetual markets.');
  console.log(`[market-alerts] ${lastCheckAt} checking ${symbols.join(', ')}`);
  const state=await loadState();
  const sent=state.sentEvents && typeof state.sentEvents==='object' ? state.sentEvents : {};
  for(const symbol of symbols) {
    const event=await inspect(symbol);
    if(!event) continue;
    const key=`${event.symbol}-${event.direction}-${event.candleTime}`;
    if(sent[key]) continue;
    const delivered=await notify(event);
    const bridgeEvent={...event,detectedAt:Date.now(),alertId:key};
    latestEvent=bridgeEvent;
    sent[key]={at:Date.now(),delivered};
    console.log(`[market-alerts] ${event.symbol} ${event.direction} BOS at ${formatPrice(event.level)}${delivered?' — notified':''}`);
  }
  const cutoff=Date.now()-7*24*60*60*1000;
  for(const [key,value] of Object.entries(sent)) if(!value?.at || value.at<cutoff) delete sent[key];
  await saveState({sentEvents:sent,updatedAt:Date.now()});
}

async function main() {
  console.log('[market-alerts] KitSetups Termux monitor started.');
  console.log(`[market-alerts] Poll interval: ${POLL_MS/60000} minutes`);
  console.log(`[market-alerts] State file: ${STATE_FILE}`);
  while(true) {
    try { await checkOnce(); } catch(error) {
      lastError = error?.message || String(error);
      console.error(`[market-alerts] check failed: ${lastError}`);
    }
    await sleep(POLL_MS);
  }
}
process.on('SIGINT',()=>{console.log('\\n[market-alerts] stopped.');bridge.close(()=>process.exit(0));});
process.on('SIGTERM',()=>{bridge.close(()=>process.exit(0));});
main().catch(error=>{console.error(error);process.exit(1);});
