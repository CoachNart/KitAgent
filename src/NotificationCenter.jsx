import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, CheckCircle2, Radio, X, Zap } from 'lucide-react';
import { enableKitSetupsNotifications } from './notifications.js';
import { getMarketAlertSnapshot } from './marketAlerts.js';

const KEY='kitsetups-market-alerts-v2';
const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
const fmtPrice=(v)=>Number.isFinite(Number(v))?`$${Number(v).toLocaleString(undefined,{maximumFractionDigits:Number(v)<10?4:2})}`:'—';
const fmtTime=(v)=>v?new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—';

export default function NotificationCenter({user,embedded=false}){
 const [open,setOpen]=useState(false),[alerts,setAlerts]=useState(read),[symbol,setSymbol]=useState('BTCUSDT'),[direction,setDirection]=useState('above'),[target,setTarget]=useState(''),[permission,setPermission]=useState(typeof Notification!=='undefined'?Notification.permission:'default'),[market,setMarket]=useState(()=>getMarketAlertSnapshot());
 useEffect(()=>localStorage.setItem(KEY,JSON.stringify(alerts)),[alerts]);
 useEffect(()=>{
   const onUpdate=e=>setMarket(e.detail||getMarketAlertSnapshot());
   window.addEventListener('kitagent:market-alert-update',onUpdate);
   setMarket(getMarketAlertSnapshot());
   return()=>window.removeEventListener('kitagent:market-alert-update',onUpdate);
 },[]);
 useEffect(()=>{
   let dead=false;
   const tick=async()=>{
     const prices={};
     await Promise.all(SYMBOLS.map(async s=>{try{const u=new URL('https://api.bybit.com/v5/market/tickers');u.searchParams.set('category','linear');u.searchParams.set('symbol',s);const r=await fetch(u,{cache:'no-store'});const b=await r.json();if(!dead&&b?.retCode===0)prices[s]=Number(b?.result?.list?.[0]?.lastPrice)}catch{}}));
     if(dead)return;
     setAlerts(a=>a.map(x=>{if(x.triggered||!prices[x.symbol])return x;const p=prices[x.symbol],hit=x.direction==='above'?p>=x.target:p<=x.target;if(!hit)return x;if(typeof Notification!=='undefined'&&Notification.permission==='granted')try{new Notification(`${x.symbol.replace('USDT','')} price alert`,{body:`Price reached ${fmtPrice(p)}.`,icon:'/kitsetups-logo.svg',tag:`alert-${x.id}`})}catch{}return {...x,triggered:true,triggeredPrice:p,triggeredAt:Date.now()}}));
   };
   tick();const id=setInterval(tick,30000);return()=>{dead=true;clearInterval(id)}
 },[]);
 const count=useMemo(()=>alerts.filter(a=>!a.triggered).length,[alerts]);
 const liveMarkets=market.markets||[];
 const upcoming=market.news||[];
 const enable=async()=>{try{const r=await enableKitSetupsNotifications(user);setPermission(r.enabled?'granted':(typeof Notification!=='undefined'?Notification.permission:'denied'))}catch{}};
 const add=()=>{const n=Number(target);if(!Number.isFinite(n)||n<=0)return;setAlerts(a=>[...a,{id:crypto.randomUUID(),symbol,direction,target:n,createdAt:Date.now(),triggered:false}]);setTarget('')};
 return <div style={embedded?wrapEmbedded:wrapFloating}>
  <button aria-label="Open notifications" onClick={()=>setOpen(v=>!v)} style={embedded?buttonEmbedded:button}>{count?<BellRing size={17}/>:<Bell size={17}/>} {count>0&&<span style={badge}>{count}</span>}</button>
  {open&&<div style={embedded?panelEmbedded:panel}>
   <div style={head}><div><strong>Market alerts</strong><div style={sub}>Live structure + scheduled news</div></div><button onClick={()=>setOpen(false)} style={close}><X size={16}/></button></div>
   <div style={statusCard}><div style={statusTop}><span><Radio size={12}/> BYBIT LIVE</span><small>{market.checkedAt?`Checked ${fmtTime(market.checkedAt)}`:'Starting monitor…'}</small></div><div style={statusGrid}><div><b>{liveMarkets.filter(x=>x.ok).length}/{SYMBOLS.length}</b><span>symbols online</span></div><div><b>5m</b><span>structure</span></div><div><b>{upcoming.length}</b><span>high impact</span></div></div>{market.error&&<div style={error}>{market.error}</div>}</div>
   {market.lastEvent&&<div style={eventCard}><div style={eventIcon}><Zap size={13}/></div><div><b>{market.lastEvent.symbol?.replace('USDT','')} {market.lastEvent.direction} BOS</b><span>{fmtPrice(market.lastEvent.level)} · detected {fmtTime(market.lastEvent.detectedAt)}</span></div></div>}
   {upcoming.length>0&&<div style={section}><div style={sectionTitle}>UPCOMING HIGH-IMPACT</div>{upcoming.slice(0,3).map(n=><div style={newsItem} key={n.id}><div><b>{n.country||'Market'} · {n.title||'Economic release'}</b><span>{fmtTime(n.when)} · scheduled</span></div></div>)}</div>}
   {permission!=='granted'&&<button onClick={enable} style={enableBtn}><Bell size={14}/> Enable browser notifications</button>}
   <div style={section}><div style={sectionTitle}>PRICE ALERT</div><div style={row}><select value={symbol} onChange={e=>setSymbol(e.target.value)} style={field}>{SYMBOLS.map(s=><option key={s}>{s}</option>)}</select><select value={direction} onChange={e=>setDirection(e.target.value)} style={field}><option value="above">Above</option><option value="below">Below</option></select></div><div style={row}><input inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Target price" style={{...field,flex:1}}/><button onClick={add} style={addBtn}>Add</button></div></div>
   <div style={list}>{alerts.length===0&&<div style={empty}>No manual price alerts.</div>}{alerts.slice().reverse().map(a=><div key={a.id} style={item}><div><strong>{a.symbol.replace('USDT','')}</strong> {a.direction} {fmtPrice(a.target)}<div style={meta}>{a.triggered?'Triggered':'Watching'}</div></div><button onClick={()=>setAlerts(x=>x.filter(y=>y.id!==a.id))} style={close}>×</button></div>)}</div>
   <div style={footer}><CheckCircle2 size={12}/> Alerts run while KitSetups is open on this client.</div>
  </div>}
 </div>;
}

const wrapEmbedded={position:'relative',display:'flex',alignItems:'center',flexShrink:0};
const wrapFloating={display:'none'};
const buttonEmbedded={position:'relative',width:32,height:32,borderRadius:9,border:'1px solid rgba(255,255,255,.09)',background:'transparent',color:'rgba(255,255,255,.72)',display:'grid',placeItems:'center',cursor:'pointer',padding:0};
const button={display:'none'};
const badge={position:'absolute',right:-2,top:-2,minWidth:14,height:14,borderRadius:99,background:'#ef4444',fontSize:8,fontWeight:800,display:'grid',placeItems:'center',padding:'0 2px'};
const panelEmbedded={position:'absolute',right:0,top:'calc(100% + 7px)',zIndex:1400,width:'min(310px,calc(100vw - 20px))',maxWidth:'calc(100vw - 20px)',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,background:'rgba(12,16,23,.98)',backdropFilter:'blur(18px)',color:'#fff',boxShadow:'0 16px 38px rgba(0,0,0,.42)',padding:10,boxSizing:'border-box',overflow:'hidden'};
const panel={display:'none'};
const head={display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9};
const row={display:'flex',gap:5,marginBottom:6,minWidth:0};
const field={minWidth:0,width:0,flex:1,padding:'7px 8px',borderRadius:7,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.055)',color:'#fff',outline:'none',fontSize:10};
const close={background:'none',border:0,color:'#fff',cursor:'pointer',opacity:.7,padding:3};
const enableBtn={width:'100%',padding:'8px',borderRadius:7,border:'1px solid rgba(0,199,254,.2)',background:'rgba(0,199,254,.07)',color:'#9deaff',cursor:'pointer',display:'flex',gap:6,alignItems:'center',justifyContent:'center',marginBottom:8,fontSize:10};
const addBtn={padding:'0 10px',borderRadius:7,border:0,background:'#fff',color:'#000',display:'grid',placeItems:'center',cursor:'pointer',fontSize:9,fontWeight:800};
const list={marginTop:8,display:'grid',gap:4,maxHeight:120,overflow:'auto'};
const item={display:'flex',alignItems:'center',justifyContent:'space-between',gap:5,padding:'6px 7px',borderRadius:7,background:'rgba(255,255,255,.045)',fontSize:10,minWidth:0};
const sub={fontSize:9,opacity:.55,marginTop:2};
const meta={fontSize:8,opacity:.45,marginTop:2};
const empty={fontSize:9,opacity:.45,padding:'7px 0'};
const statusCard={border:'1px solid rgba(66,230,160,.16)',background:'rgba(66,230,160,.045)',borderRadius:9,padding:8,marginBottom:7};
const statusTop={display:'flex',justifyContent:'space-between',alignItems:'center',gap:6};
const statusTopSpan={fontSize:8};
const statusGrid={display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5,marginTop:8};
const eventCard={display:'flex',gap:8,alignItems:'center',border:'1px solid rgba(0,199,254,.14)',background:'rgba(0,199,254,.04)',borderRadius:8,padding:8,marginBottom:7};
const eventIcon={width:25,height:25,borderRadius:7,display:'grid',placeItems:'center',background:'rgba(0,199,254,.08)',color:'#78e0ff',flexShrink:0};
const section={borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:8,marginTop:8};
const sectionTitle={fontSize:7,letterSpacing:'.13em',fontWeight:800,opacity:.42,marginBottom:6};
const newsItem={padding:'6px 7px',borderRadius:7,background:'rgba(255,255,255,.035)',marginBottom:4};
const error={fontSize:8,color:'#ffadad',marginTop:6};
const footer={display:'flex',gap:5,alignItems:'center',fontSize:7.5,opacity:.42,marginTop:9};
