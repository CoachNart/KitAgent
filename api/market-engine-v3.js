import marketEngine from './market-engine-v2.js';
import { yahooCandles } from '../server/yahooMarket.js';

const TF_MS={'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1H':3600000,'4H':14400000,'1D':86400000};
const BYBIT_INTERVAL={'1m':'1','5m':'5','15m':'15','30m':'30','1H':'60','4H':'240','1D':'D'};
function json(res,status,p){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.end(JSON.stringify(p))}
function sma(a,n){const v=a.filter(Number.isFinite).slice(-n);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null}
function atr(c,n=14){const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return sma(tr,n)}
function pivots(c){const h=[],l=[];for(let i=3;i<c.length-3;i++){let hi=true,lo=true;for(let j=1;j<=3;j++){if(c[i].high<=c[i-j].high||c[i].high<c[i+j].high)hi=false;if(c[i].low>=c[i-j].low||c[i].low>c[i+j].low)lo=false}if(hi)h.push({p:c[i].high,i});if(lo)l.push({p:c[i].low,i})}return{h,l}}
function groupedLevels(c,bias,entry,opposite=false){const a=atr(c)||Math.abs(entry)*.002,s=pivots(c),src=opposite?(bias==='LONG'?s.h:s.l):(bias==='LONG'?s.l:s.h),side=opposite?(bias==='LONG'?x=>x.p>entry:x=>x.p<entry):(bias==='LONG'?x=>x.p<entry:x=>x.p>entry),tol=Math.max(a*.22,Math.abs(entry)*.0008),groups=[];for(const p of src.filter(side).filter(x=>x.i>=Math.max(0,c.length-240))){let g=groups.find(x=>Math.abs(x.mid-p.p)<=tol);if(!g){g={mid:p.p,points:[]};groups.push(g)}g.points.push(p);g.mid=g.points.reduce((q,x)=>q+x.p,0)/g.points.length}return groups.map(g=>{const edge=opposite?(bias==='LONG'?Math.max(...g.points.map(x=>x.p)):Math.min(...g.points.map(x=>x.p))):(bias==='LONG'?Math.min(...g.points.map(x=>x.p)):Math.max(...g.points.map(x=>x.p)));const excursion=g.points.reduce((best,p)=>Math.max(best,bias==='LONG'?Math.max(0,...c.slice(p.i+1,Math.min(c.length,p.i+30)).map(x=>x.high-p.p)):Math.max(0,...c.slice(p.i+1,Math.min(c.length,p.i+30)).map(x=>p.p-x.low))),0);const touches=g.points.length;const age=c.length-1-Math.max(...g.points.map(x=>x.i));const displacement=excursion/a;const score=displacement+Math.min(touches,4)*.8+Math.min(age/30,3)*.15;const strong=displacement>=1||touches>=3||(displacement>=.75&&age>=18);return{...g,edge,excursion,touches,age,score,displacement,strong}}).filter(x=>x.strong).sort((a,b)=>b.score-a.score)}
async function candles(market,symbol,tf){if(!TF_MS[tf])return[];if(['forex','commodities','indices'].includes(market))return(await yahooCandles(symbol,tf,market)).rows.map(r=>({time:+r[0],open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+(r[5]||0)})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);const clean=symbol.replace(/[^A-Z0-9]/gi,'');const u=new URL('https://api.bybit.com/v5/market/kline');u.searchParams.set('category','linear');u.searchParams.set('symbol',clean);u.searchParams.set('interval',BYBIT_INTERVAL[tf]);u.searchParams.set('limit','300');const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Bybit candles unavailable');const b=await r.json();if(b.retCode!==0)throw new Error(b.retMsg||'Bybit candles unavailable');return b.result.list.slice().reverse().map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}))}
function round(v){if(!Number.isFinite(v))return null;if(v>=1000)return+v.toFixed(2);if(v>=100)return+v.toFixed(3);if(v>=1)return+v.toFixed(5);if(v>=.1)return+v.toFixed(6);return+v.toPrecision(7)}
function trend(c){const s=pivots(c),h=s.h.slice(-5),l=s.l.slice(-5);if(h.length<2||l.length<2)return'WAIT';const hh=h.at(-1).p>h.at(-2).p,hl=l.at(-1).p>l.at(-2).p,lh=h.at(-1).p<h.at(-2).p,ll=l.at(-1).p<l.at(-2).p;return hh&&hl?'LONG':lh&&ll?'SHORT':'WAIT'}
function reject(setup,reason){setup.tradeReady=false;setup.setupStatus='NO SETUP';setup.orderType='NO_SETUP';setup.setupReason=reason;setup.confidence=0;setup.entry=null;setup.limitEntry=null;setup.stopLoss=null;setup.takeProfit1=null;setup.takeProfit2=null;setup.riskReward='—';setup.riskRewardValue=null;return setup}
async function hardenSetup(payload){
 const setup=payload?.setup;if(!setup?.tradeReady||!Number.isFinite(+setup.entry)||!setup.bias)return payload;
 const market=payload.market,symbol=payload.symbol,bias=setup.bias,price=+payload.quote?.mid,tf=setup.entryTimeframe||payload.timeframe;
 if(!Number.isFinite(price)||!tf)return payload;
 const c=await candles(market,symbol,tf);if(c.length<80)return reject(setup,'Insufficient closed candles for structural validation.');
 const a=atr(c);if(!a)return reject(setup,'Volatility could not be established from the closed candles.');
 const entry=+setup.entry;
 const strategy=String(payload.strategy||setup.strategy||setup.strategyName||setup.model||'').toLowerCase();
 const continuation=['top_down','pullback','breakout','smc','msnr','price_action'].some(x=>strategy.includes(x));
 const htf=setup.higherTimeframe&&setup.higherTimeframe!==tf?await candles(market,symbol,setup.higherTimeframe):[];
 const structure=setup.middleTimeframe&&setup.middleTimeframe!==tf?await candles(market,symbol,setup.middleTimeframe):[];
 const htfBias=htf.length>=80?trend(htf):'WAIT',structureBias=structure.length>=80?trend(structure):'WAIT';
 if(continuation&&(htfBias!==bias&&structureBias!==bias))return reject(setup,'Higher-timeframe structure does not support the proposed direction.');
 const stops=groupedLevels(c,bias,entry,false),targets=groupedLevels(c,bias,entry,true);
 if(!stops.length)return reject(setup,'No validated structural swing provides a safe invalidation distance.');
 const maxRisk=Math.min(a*3.2,entry*.025),minRisk=Math.max(a*.75,entry*.0012),buffer=Math.max(a*.32,entry*.0007);
 const stopCandidates=stops.map(x=>{const stop=bias==='LONG'?x.edge-buffer:x.edge+buffer;return{...x,stop,risk:Math.abs(entry-stop)}}).filter(x=>x.risk>=minRisk&&x.risk<=maxRisk);
 if(!stopCandidates.length)return reject(setup,'No validated structural swing provides a safe invalidation distance.');
 const stop=stopCandidates.sort((x,y)=>{
   const ax=Math.abs(entry-x.edge)/a,ay=Math.abs(entry-y.edge)/a;
   const relevanceA=(ax<=1.8?2:0)+(x.age<=60?1:0)+(x.touches>=2?2:0)+(x.displacement>=1.1?2:0);
   const relevanceB=(ay<=1.8?2:0)+(y.age<=60?1:0)+(y.touches>=2?2:0)+(y.displacement>=1.1?2:0);
   return relevanceB-relevanceA||y.score-x.score||ax-ay;
 })[0];
 const entryToStructure=Math.abs(entry-stop.edge)/a;
 if(entryToStructure>1.5)return reject(setup,'Entry is not anchored closely enough to a validated structural swing.');
 if(stop.age>120)return reject(setup,'The selected swing is too old to be a relevant current invalidation level.');
 if(stop.touches<2&&stop.displacement<1.1)return reject(setup,'The selected swing lacks sufficient reaction strength or repeated respect.');
 if((strategy.includes('msnr')||strategy.includes('smc'))&&stop.touches<2&&stop.displacement<1.25)return reject(setup,'SMC/MSNR level lacks sufficient structural validation.');
 const order=String(setup.orderType||'').toUpperCase(),newEntry=order==='MARKET'?price:entry;
 if(order==='LIMIT'&&Math.abs(entry-price)>a*1.5)return reject(setup,'Planned limit entry is too far from current market structure.');
 const target=targets.map(x=>({...x,distance:Math.abs(x.edge-newEntry),rr:Math.abs(x.edge-newEntry)/Math.abs(newEntry-stop.stop)}))
   .filter(x=>x.distance>=a*1.15&&x.distance<=a*6&&x.rr>=2)
   .sort((x,y)=>x.distance-y.distance||y.score-x.score)[0];
 if(!target)return reject(setup,'No nearby meaningful opposing swing or liquidity target provides at least 2R.');
 const rr=Math.abs(target.edge-newEntry)/Math.abs(newEntry-stop.stop);
 if(!Number.isFinite(rr)||rr<2)return reject(setup,'Structural trade does not meet the minimum natural 2R requirement.');
 const structureScore=(htfBias===bias?3:0)+(structureBias===bias?2:0)+(stop.touches>=2?2:0)+(stop.displacement>=1.25?2:0)+(stop.age<=60?1:0)+(target.touches>=2?2:0)+(target.displacement>=1.1?1:0);
 const confidence=Math.min(92,Math.max(58,Math.round(58+structureScore*3+Math.min(rr,3)*2)));
 setup.entry=round(newEntry);setup.limitEntry=order==='LIMIT'?round(newEntry):null;setup.stopLoss=round(stop.stop);setup.takeProfit1=round(target.edge);setup.stopDistance=round(Math.abs(newEntry-stop.stop));setup.riskPercent=+(Math.abs(newEntry-stop.stop)/newEntry*100).toFixed(2);setup.riskReward='1:'+rr.toFixed(2);setup.riskRewardValue=+rr.toFixed(2);setup.structuralInvalidation=round(stop.stop);setup.liquidityTarget=round(target.edge);setup.entryMethod=(setup.entryMethod||'STRUCTURAL')+' · STRUCTURE-VALIDATED';
 setup.confidence=confidence;setup.structureEvidence={swingEdge:round(stop.edge),swingTouches:stop.touches,swingDisplacementAtr:+stop.displacement.toFixed(2),swingAgeBars:stop.age,targetEdge:round(target.edge),targetTouches:target.touches,targetDisplacementAtr:+target.displacement.toFixed(2),higherTimeframeBias:htfBias,middleTimeframeBias:structureBias};
 return payload
}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});if(String(req.query?.action||'')==='header'){try{const r=await fetch('https://api.bybit.com/v5/market/tickers?category=linear',{headers:{Accept:'application/json'}});if(!r.ok)return json(res,502,{error:'Bybit ticker provider unavailable'});const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list))return json(res,502,{error:body?.retMsg||'Bybit ticker provider unavailable'});const wanted=new Set(['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT']);return json(res,200,{ok:true,result:body.result.list.filter(x=>wanted.has(x.symbol)).map(x=>({symbol:x.symbol,lastPrice:x.lastPrice,price24hPcnt:x.price24hPcnt}))})}catch(e){return json(res,502,{ok:false,error:e?.message||'Bybit ticker provider unavailable'})}}
let body=null,status=200;const proxy={...res,setHeader(){},end(data){try{body=JSON.parse(data)}catch{body={ok:false,error:'Market engine returned invalid JSON'}}}};try{await marketEngine(req,proxy)}catch(e){return json(res,500,{ok:false,error:e?.message||'Market analysis failed'})}if(body?.ok&&body.setup?.tradeReady){try{body=await hardenSetup(body)}catch(e){if(body?.setup)reject(body.setup,'Structural validation failed; no setup issued.')}}return json(res,status,body||{ok:false,error:'Market analysis returned no response'})}
