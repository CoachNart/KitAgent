import React, { useEffect, useState } from 'react';
import { getEntitlement } from '../services/storage';
import StatCard from '../components/StatCard';

export default function SignalsPage() {
  const [entitlement, setEntitlement] = useState(getEntitlement());
  useEffect(() => { const id = setInterval(() => setEntitlement(getEntitlement()), 60000); return () => clearInterval(id); }, []);
  const locked = entitlement.plan === 'expired';
  return <section className="page"><div className="signal-hero"><div><span className="pill">{entitlement.plan.toUpperCase()}</span><h2>{locked ? 'Premium signal desk is locked.' : 'Signal desk is open.'}</h2><p>{locked ? 'Your 3-day trial has ended. Premium unlocks the full signal feed and deeper setup context.' : `${entitlement.daysLeft} day${entitlement.daysLeft === 1 ? '' : 's'} remaining on your current access.`}</p></div><button className="primary" onClick={() => window.alert('Premium checkout is intentionally gated until a payment provider is configured.')}>{locked ? 'UNLOCK PREMIUM' : 'MANAGE ACCESS'}</button></div><div className={locked ? 'signal-lock locked' : 'signal-lock'}><div className="blurred">BTC/USDT · LONG · liquidity sweep → structure break → target<br/>ETH/USDT · LONG · reclaim → displacement → target<br/>EUR/USD · SHORT · buy-side raid → delivery shift → target</div>{locked && <div className="lock-overlay"><span>◆</span><b>PREMIUM SIGNALS</b><small>Subscribe to unlock</small></div>}</div><div className="stats"><StatCard label="TRIAL" value="3 DAYS"/><StatCard label="PREMIUM" value="30 DAYS"/><StatCard label="DELIVERY" value="Alerts + analysis"/></div></section>;
}
