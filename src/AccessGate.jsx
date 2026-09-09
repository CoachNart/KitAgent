import { useEffect, useState } from 'react';
import { Clock3, LockKeyhole } from 'lucide-react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';

const TRIAL_MS=3*24*60*60*1000;
export default function AccessGate({user,children}){
 const [profile,setProfile]=useState(null),[loaded,setLoaded]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{if(!db||!user?.uid){setLoaded(true);return undefined}return onSnapshot(doc(db,'users',user.uid),s=>{setProfile(s.exists()?s.data():null);setLoaded(true)},()=>setLoaded(true))},[user?.uid]);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
 if(!loaded||!profile)return <div className="access-locked"><div className="access-locked-card"><span className="access-kicker">VERIFYING ACCESS</span><h2>Setting up your KitSetups access</h2><p>Confirming your account and activating your free 3-day access.</p></div></div>;
 const plan=String(profile.plan||'free').toLowerCase();
 const subscriptionEnd=toMs(profile.subscriptionEndsAt);
 const created=toMs(profile.createdAt);
 const started=toMs(profile.trialStartedAt)||created;
 const storedTrialEnd=toMs(profile.trialEndsAt);
 // A newly created free account is entitled to three full days even if an older/broken
 // trial timestamp was written during account provisioning. Never extend an established
 // account here; only repair profiles whose creation time is still inside the trial window.
 const freshAccount=created>0&&created+TRIAL_MS>now;
 const derivedEnd=started?started+TRIAL_MS:0;
 const trialEnd=freshAccount?Math.max(storedTrialEnd,derivedEnd,created+TRIAL_MS):(storedTrialEnd||derivedEnd);
 useEffect(()=>{
  if(!db||!user?.uid||plan==='premium'||!freshAccount)return;
  if(storedTrialEnd>=created+TRIAL_MS&&started)return;
  setDoc(doc(db,'users',user.uid),{plan:'free',trialStartedAt:profile.trialStartedAt||new Date(created),trialEndsAt:new Date(created+TRIAL_MS),updatedAt:serverTimestamp()},{merge:true}).catch(error=>console.warn('KitSetups trial repair deferred:',error));
 },[user?.uid,plan,freshAccount,storedTrialEnd,started,created]);
 const premiumActive=plan==='premium'&&subscriptionEnd>now;
 const trialActive=plan!=='premium'&&trialEnd>now;
 if(premiumActive||trialActive)return children;
 return <div className="access-locked"><div className="access-locked-card"><div className="access-lock-icon"><LockKeyhole size={18}/></div><span className="access-kicker">PREMIUM ACCESS</span><h2>Your free access has ended</h2><p>Subscribe to Premium to continue using Market Analysis and Chart Terminal.</p><div className="access-lock-meta"><span><Clock3 size={12}/> Access expired</span><b>Premium · $20 / 30D</b></div><button type="button" className="access-subscribe" onClick={()=>window.dispatchEvent(new CustomEvent('kitagent-open-profile'))}>View Premium plan</button><small>Your account and wallet remain safe. No transaction is executed from this notice.</small></div></div>
}
function toMs(value){if(!value)return 0;if(typeof value.toMillis==='function')return value.toMillis();if(typeof value.toDate==='function')return value.toDate().getTime();if(value instanceof Date)return value.getTime();const n=new Date(value).getTime();return Number.isFinite(n)?n:0}
