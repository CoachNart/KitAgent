import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, Plus, Trash2, X } from 'lucide-react';
import { enableKitSetupsNotifications } from './notifications.js';

const KEY='kitsetups-market-alerts-v1';
const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};

export default function NotificationCenter({user,embedded=false}){
 const [open,setOpen]=useState(false),[alerts,setAlerts]=useState(read),[symbol,setSymbol]=useState('BTCUSDT'),[direction,setDirection]=useState('above'),[target,setTarget]=useState(''),[permission,setPermission]=useState(typeof Notification!=='undefined'?Notification.permission:'default');
 useEffect(()=>localStorage.setItem(KEY,JSON.stringify(alerts)),[alerts]);
 useEffect(()=>{let dead=false;const tick=async()=>{const prices={};await Promise.all(SYMBOLS.map(async s=>{try{const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${s}`);if(r.ok)prices[s]=Number((await r.json()).price)}catch{}}));if(dead)return;setAlerts(a=>a.map(x=>{if(x.triggered||!prices[x.symbol])return x;const p=prices[x.symbol],hit=x.direction==='above'?p>=x.target:p<=x.target;if(!hit)return x;if(typeof Notification!=='undefined'&&Notification.permission==='granted')try{new Notification(`${x.symbol.replace('USDT','')} price alert`,{body:`Price reached $${p.toLocaleString(undefined,{maximumFractionDigits:6})}.`,icon:'/kitsetups-logo.svg',tag:`alert-${x.id}`})}catch{}return {...x,triggered:true,triggeredPrice:p,triggeredAt:Date.now()}}))};tick();const id=setInterval(tick,15000);return()=>{dead=true;clearInterval(id)}},[]);
 const count=useMemo(()=>alerts.filter(a=>!a.triggered).length,[alerts]);
 const enable=async()=>{try{const r=await enableKitSetupsNotifications(user);setPermission(r.enabled?'granted':(typeof Notification!=='undefined'?Notification.permission:'denied'))}catch{}};
 const add=()=>{const n=Number(target);if(!Number.isFinite(n)||n<=0)return;setAlerts(a=>[...a,{id:crypto.randomUUID(),symbol,direction,target:n,createdAt:Date.now(),triggered:false}]);setTarget('')};
 return <div style={embedded?wrapEmbedded:wrapFloating}><button aria-label="Open notifications" onClick={()=>setOpen(v=>!v)} style={embedded?buttonEmbedded:button}>{count?<BellRing size={17}/>:<Bell size={17}/>} {count>0&&<span style={badge}>{count}</span>}</button>{open&&<div style={embedded?panelEmbedded:panel}><div style={head}><div><strong>Alerts</strong><div style={sub}>Market and account notifications</div></div><button onClick={()=>setOpen(false)} style={close}><X size={16}/></button></div>{permission!=='granted'&&<button onClick={enable} style={enableBtn}><Bell size={14}/> Enable push notifications</button>}<div style={row}><select value={symbol} onChange={e=>setSymbol(e.target.value)} style={field}>{SYMBOLS.map(s=><option key={s}>{s}</option>)}</select><select value={direction} onChange={e=>setDirection(e.target.value)} style={field}><option value="above">Above</option><option value="below">Below</option></select></div><div style={row}><input inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Target price" style={{...field,flex:1}}/><button onClick={add} style={addBtn}><Plus size={15}/></button></div><div style={list}>{alerts.length===0&&<div style={empty}>No alerts yet.</div>}{alerts.slice().reverse().map(a=><div key={a.id} style={item}><div><strong>{a.symbol.replace('USDT','')}</strong> {a.direction} ${a.target.toLocaleString()}<div style={meta}>{a.triggered?'Triggered':'Watching'}</div></div><button onClick={()=>setAlerts(x=>x.filter(y=>y.id!==a.id))} style={close}><Trash2 size={13}/></button></div>)}</div><div style={meta}>Prices refresh automatically while KitSetups is open.</div></div>}</div>;
}

const wrapEmbedded={position:'relative',display:'flex',alignItems:'center',flexShrink:0};
const wrapFloating={display:'none'};
const buttonEmbedded={position:'relative',width:32,height:32,borderRadius:9,border:'1px solid rgba(255,255,255,.09)',background:'transparent',color:'rgba(255,255,255,.72)',display:'grid',placeItems:'center',cursor:'pointer',padding:0};
const button={display:'none'};
const badge={position:'absolute',right:-2,top:-2,minWidth:14,height:14,borderRadius:99,background:'#ef4444',fontSize:8,fontWeight:800,display:'grid',placeItems:'center',padding:'0 2px'};
const panelEmbedded={position:'absolute',right:0,top:'calc(100% + 7px)',zIndex:1400,width:'min(260px,calc(100vw - 20px))',maxWidth:'calc(100vw - 20px)',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,background:'rgba(12,16,23,.98)',backdropFilter:'blur(18px)',color:'#fff',boxShadow:'0 16px 38px rgba(0,0,0,.42)',padding:10,boxSizing:'border-box',overflow:'hidden'};
const panel={display:'none'};
const head={display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9};
const row={display:'flex',gap:5,marginBottom:6,minWidth:0};
const field={minWidth:0,width:0,flex:1,padding:'7px 8px',borderRadius:7,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.055)',color:'#fff',outline:'none',fontSize:10};
const close={background:'none',border:0,color:'#fff',cursor:'pointer',opacity:.7,padding:3};
const enableBtn={width:'100%',padding:'7px 8px',borderRadius:7,border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.06)',color:'#fff',cursor:'pointer',display:'flex',gap:6,alignItems:'center',justifyContent:'center',marginBottom:8,fontSize:10};
const addBtn={width:34,borderRadius:7,border:0,background:'#fff',color:'#000',display:'grid',placeItems:'center',cursor:'pointer',flex:'0 0 34px'};
const list={marginTop:8,display:'grid',gap:4,maxHeight:150,overflow:'auto'};
const item={display:'flex',alignItems:'center',justifyContent:'space-between',gap:5,padding:'6px 7px',borderRadius:7,background:'rgba(255,255,255,.045)',fontSize:10,minWidth:0};
const sub={fontSize:9,opacity:.55,marginTop:2};
const meta={fontSize:8,opacity:.45,marginTop:2};
const empty={fontSize:10,opacity:.45,padding:'7px 0'};
