import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, Plus, Trash2, X } from 'lucide-react';
import { enableKitSetupsNotifications } from './notifications.js';

const KEY='kitsetups-market-alerts-v1';
const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};

export default function NotificationCenter({user}){
 const [open,setOpen]=useState(false),[alerts,setAlerts]=useState(read),[symbol,setSymbol]=useState('BTCUSDT'),[direction,setDirection]=useState('above'),[target,setTarget]=useState(''),[permission,setPermission]=useState(typeof Notification!=='undefined'?Notification.permission:'default');
 useEffect(()=>localStorage.setItem(KEY,JSON.stringify(alerts)),[alerts]);
 useEffect(()=>{let dead=false;const tick=async()=>{const prices={};await Promise.all(SYMBOLS.map(async s=>{try{const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${s}`);if(r.ok)prices[s]=Number((await r.json()).price)}catch{}}));if(dead)return;setAlerts(a=>a.map(x=>{if(x.triggered||!prices[x.symbol])return x;const p=prices[x.symbol],hit=x.direction==='above'?p>=x.target:p<=x.target;if(!hit)return x;if(typeof Notification!=='undefined'&&Notification.permission==='granted')try{new Notification(`${x.symbol.replace('USDT','')} price alert`,{body:`Price reached $${p.toLocaleString(undefined,{maximumFractionDigits:6})}.`,icon:'/kitsetups-logo.svg',tag:`alert-${x.id}`})}catch{}return {...x,triggered:true,triggeredPrice:p,triggeredAt:Date.now()}}))};tick();const id=setInterval(tick,15000);return()=>{dead=true;clearInterval(id)}},[]);
 const count=useMemo(()=>alerts.filter(a=>!a.triggered).length,[alerts]);
 const enable=async()=>{try{const r=await enableKitSetupsNotifications(user);setPermission(r.enabled?'granted':(typeof Notification!=='undefined'?Notification.permission:'denied'))}catch{}};
 const add=()=>{const n=Number(target);if(!Number.isFinite(n)||n<=0)return;setAlerts(a=>[...a,{id:crypto.randomUUID(),symbol,direction,target:n,createdAt:Date.now(),triggered:false}]);setTarget('')};
 return <><button aria-label="Open notifications" onClick={()=>setOpen(v=>!v)} style={button}>{count?<BellRing size={18}/>:<Bell size={18}/>} {count>0&&<span style={badge}>{count}</span>}</button>{open&&<div style={panel}><div style={head}><div><strong>Alerts</strong><div style={sub}>Market and account notifications</div></div><button onClick={()=>setOpen(false)} style={close}><X size={17}/></button></div>{permission!=='granted'&&<button onClick={enable} style={enableBtn}><Bell size={15}/> Enable push notifications</button>}<div style={row}><select value={symbol} onChange={e=>setSymbol(e.target.value)} style={field}>{SYMBOLS.map(s=><option key={s}>{s}</option>)}</select><select value={direction} onChange={e=>setDirection(e.target.value)} style={field}><option value="above">Above</option><option value="below">Below</option></select></div><div style={row}><input inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Target price" style={{...field,flex:1}}/><button onClick={add} style={addBtn}><Plus size={17}/></button></div><div style={list}>{alerts.length===0&&<div style={empty}>No alerts yet.</div>}{alerts.slice().reverse().map(a=><div key={a.id} style={item}><div><strong>{a.symbol.replace('USDT','')}</strong> {a.direction} ${a.target.toLocaleString()}<div style={meta}>{a.triggered?'Triggered':'Watching'}</div></div><button onClick={()=>setAlerts(x=>x.filter(y=>y.id!==a.id))} style={close}><Trash2 size={14}/></button></div>)}</div><div style={meta}>Prices refresh automatically while KitSetups is open.</div></div>}</>;
}

// Keep the alert control in its own quiet header zone rather than over the wallet CTA.
// The panel follows the same anchor so it never opens on top of the wallet control.
const button={position:'fixed',right:18,top:76,zIndex:1200,width:40,height:40,borderRadius:12,border:'1px solid rgba(255,255,255,.12)',background:'rgba(10,14,20,.78)',backdropFilter:'blur(14px)',color:'#fff',display:'grid',placeItems:'center',cursor:'pointer'};
const badge={position:'absolute',right:-2,top:-3,minWidth:16,height:16,borderRadius:99,background:'#ef4444',fontSize:10,fontWeight:800,display:'grid',placeItems:'center'};
const panel={position:'fixed',right:18,top:124,zIndex:1199,width:'min(360px,calc(100vw - 36px))',border:'1px solid rgba(255,255,255,.12)',borderRadius:18,background:'rgba(12,16,23,.96)',backdropFilter:'blur(18px)',color:'#fff',boxShadow:'0 20px 60px rgba(0,0,0,.4)',padding:16};
const head={display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14};
const row={display:'flex',gap:8,marginBottom:8};
const field={minWidth:0,padding:'10px 11px',borderRadius:10,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.055)',color:'#fff',outline:'none'};
const close={background:'none',border:0,color:'#fff',cursor:'pointer',opacity:.7};
const enableBtn={width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.06)',color:'#fff',cursor:'pointer',display:'flex',gap:8,alignItems:'center',justifyContent:'center',marginBottom:12};
const addBtn={width:42,borderRadius:10,border:0,background:'#fff',color:'#000',display:'grid',placeItems:'center',cursor:'pointer'};
const list={marginTop:14,display:'grid',gap:7,maxHeight:220,overflow:'auto'};
const item={display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'9px 10px',borderRadius:10,background:'rgba(255,255,255,.045)',fontSize:12};
const sub={fontSize:11,opacity:.55,marginTop:3};
const meta={fontSize:10,opacity:.45,marginTop:3};
const empty={fontSize:12,opacity:.45,padding:'10px 0'};
