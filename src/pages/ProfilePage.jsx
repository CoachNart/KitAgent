import React, { useEffect, useState } from 'react';
import StatCard from '../components/StatCard';
import { activatePremium, getEntitlement, getProfile } from '../services/storage';

export default function ProfilePage() {
  const [profile, setProfile] = useState(getProfile());
  const [entitlement, setEntitlement] = useState(getEntitlement());
  useEffect(() => { setProfile(getProfile()); setEntitlement(getEntitlement()); }, []);
  const upgrade = () => { const next = activatePremium(); setProfile(next); setEntitlement(getEntitlement()); };
  const created = new Date(profile.createdAt);
  return <section className="page profile"><div className="profile-hero"><div className="avatar">K</div><div><span className="muted">KITAGENT MEMBER</span><h2>Workspace profile</h2><p>One account layer for terminal, trading, history and access.</p></div><button className="primary" onClick={upgrade}>{entitlement.plan === 'premium' ? 'PREMIUM ACTIVE' : 'ACTIVATE PREMIUM'}</button></div><div className="lifetime"><div className="section-head"><div><span className="muted">LIFETIME MAP</span><h3>Usage footprint</h3></div><span className="mono">Joined {created.toLocaleDateString()}</span></div><div className="map-grid">{Array.from({ length: 84 }, (_, i) => <i key={i} className={i % 9 === 0 ? 'hot' : i % 4 === 0 ? 'warm' : ''}/>)}</div><div className="stats"><StatCard label="TODAY USERS" value="—" detail="Global metric requires backend analytics"/><StatCard label="TRIAL" value="3 DAYS"/><StatCard label="PREMIUM" value="30 DAYS"/><StatCard label="ACCESS" value={entitlement.plan.toUpperCase()} detail={`${entitlement.daysLeft} days left`}/></div></div><div className="trial"><div><span className="pill">{entitlement.plan.toUpperCase()}</span><h3>{entitlement.plan === 'expired' ? 'Trial exhausted' : entitlement.plan === 'premium' ? 'Premium access active' : 'Free trial active'}</h3><p>{entitlement.plan === 'expired' ? 'Signals are locked until premium access is activated.' : `Access has ${entitlement.daysLeft} day${entitlement.daysLeft === 1 ? '' : 's'} remaining on this device.`}</p></div><div className="counter"><b>{entitlement.daysLeft}</b><span>DAYS LEFT</span></div></div></section>;
}
