import { useEffect, useState } from 'react';
import { Clock3, LockKeyhole } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase.js';

const TRIAL_MS=3*24*60*60*1000;
export default function AccessGate({user,children}){
 const [profile,setProfile]=useState(null),[loaded,setLoaded]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{if(!db||!user?.uid){setLoaded(true);return undefined}return onSnapshot(doc(db,'users',user.uid),{includeMetadataChanges:true},s=>{setProfile(s.exists()?s.data():null);if(!s.metadata.fromCache)setLoaded(true)},()=>setLoaded(true))},[user?.uid]);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
 if(!loaded||!profile)return children;
 const plan=String(profile.plan||profile.subscription?.plan||'free').toLowerCase();
 const subscriptionEnd=toMs(profile.subscriptionEndsAt)||toMs(profile.subscription?.endsAt)||toMs(profile.subscription?.expiresAt);
 const created=toMs(profile.createdAt);
 const started=toMs(profile.trialStartedAt)||created;
 const storedTrialEnd=toMs(profile.trialEndsAt);
 // A newly created free account is entitled to three full days even if a stale trial
 // timestamp was written during provisioning. This only repairs the access calculation
 // while the account itself is still inside its original three-day creation window.
 const freshAccount=created>0&&created+TRIAL_MS>now;
 const derivedEnd=started?started+TRIAL_MS:0;
 const trialEnd=freshAccount?Math.max(storedTrialEnd,derivedEnd,created+TRIAL_MS):(storedTrialEnd||derivedEnd);
 const subscriptionStatus=String(profile.subscription?.status||'').toLowerCase();
 const premiumActive=(plan==='premium'||subscriptionStatus==='active'||subscriptionStatus==='current')&&(!subscriptionEnd||subscriptionEnd>now);
 const premiumExpired=(plan==='premium'||subscriptionStatus==='active'||subscriptionStatus==='current')&&subscriptionEnd>0&&subscriptionEnd<=now;
 const trialActive=plan!=='premium'&&trialEnd>now;
 if(premiumActive||trialActive)return children;
 const expiredPremium=premiumExpired;
 return <div className="access-locked"><div className="access-locked-card"><div className="access-lock-icon"><LockKeyhole size={18}/></div><span className="access-kicker">{expiredPremium?'PREMIUM EXPIRED':'PREMIUM ACCESS'}</span><h2>{expiredPremium?'Your Premium subscription has expired':'Your free access has ended'}</h2><p>{expiredPremium?'Renew Premium to continue using Market Analysis and Chart Terminal.':'Subscribe to Premium to continue using Market Analysis and Chart Terminal.'}</p><div className="access-lock-meta"><span><Clock3 size={12}/> Access expired</span><b>{expiredPremium?'Premium subscription · $20 / 30D':'Premium · $20 / 30D'}</b></div><button type="button" className="access-subscribe" onClick={()=>window.dispatchEvent(new CustomEvent('kitagent-open-profile'))}>{expiredPremium?'Renew Premium':'View Premium plan'}</button><small>Your account and wallet remain safe. No transaction is executed from this notice.</small></div></div>
}
function toMs(value){if(!value)return 0;if(typeof value.toMillis==='function')return value.toMillis();if(typeof value.toDate==='function')return value.toDate().getTime();if(value instanceof Date)return value.getTime();const n=new Date(value).getTime();return Number.isFinite(n)?n:0}
