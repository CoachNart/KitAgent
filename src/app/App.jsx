import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, ChartNoAxesCombined, History, LogOut, Menu, ShieldCheck, UserRound, WalletCards, X, Zap } from 'lucide-react';
import { auth, db, firebaseConfigured, functions } from '../services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AuthPage from '../pages/AuthPage';
import TerminalPage from '../pages/TerminalPage';
import TradingPage from '../pages/TradingPage';
import HistoryPage from '../pages/HistoryPage';
import ProfilePage from '../pages/ProfilePage';
import TrackRecordPage from '../pages/TrackRecordPage';
import { getDeviceBindingId } from '../services/deviceBinding';

const STORAGE_KEY = 'kitagent.demo.user.v2';
const navigation = [
  { id: 'terminal', label: 'Terminal', icon: Bot },
  { id: 'trading', label: 'Trading', icon: ChartNoAxesCombined },
  { id: 'history', label: 'Transactions', icon: History },
  { id: 'track', label: 'Track Record', icon: Activity },
  { id: 'profile', label: 'Profile', icon: UserRound },
];

function defaultUser(uid = 'demo-user', email = '') {
  return { id: uid, email, walletAddress: null, portfolioValue: 0, registeredAt: new Date().toISOString(), premiumUntil: null, maxRiskPercent: 1.5, maxTradeSize: 1000 };
}

function toDate(value, fallback = Date.now()) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

export default function App() {
  const [authUser, setAuthUser] = useState(undefined);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('terminal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!auth) {
      setAuthUser(null);
      setLoading(false);
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        setUserData(saved?.registeredAt ? { ...defaultUser(), ...saved } : null);
      } catch {
        setUserData(null);
      }
      return undefined;
    }

    return onAuthStateChanged(auth, async user => {
      setAuthUser(user);
      setAuthError('');
      if (!user) {
        setUserData(null);
        setLoading(false);
        return;
      }

      try {
        if (!functions || !db) throw new Error('KitAgent secure backend is not configured.');
        const deviceBindingId = await getDeviceBindingId();
        await httpsCallable(functions, 'initializeKitAgentAccount')({ deviceBindingId });
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        if (!snapshot.exists()) throw new Error('Could not initialize your KitAgent account.');
        const profile = snapshot.data();
        setUserData({ ...defaultUser(user.uid, user.email || ''), ...profile, id: user.uid, email: user.email || profile.email || '' });
      } catch (error) {
        setAuthError(error?.message || 'Could not verify this KitAgent account on this device.');
        setUserData(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (userData && !firebaseConfigured) localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
  }, [userData]);

  const trialEndsAt = useMemo(() => {
    if (userData?.trialEndsAt) return toDate(userData.trialEndsAt);
    const trialStarted = toDate(userData?.trialStartedAt || userData?.registeredAt);
    return new Date(trialStarted.getTime() + 3 * 24 * 60 * 60 * 1000);
  }, [userData?.trialEndsAt, userData?.trialStartedAt, userData?.registeredAt]);

  const premiumActive = Boolean(userData?.premiumUntil && toDate(userData.premiumUntil) > new Date());
  const trialActive = Boolean(userData && trialEndsAt > new Date());
  const access = premiumActive ? 'premium' : trialActive ? 'trial' : 'expired';
  const handleNavigation = page => { setCurrentPage(page); setMobileMenuOpen(false); };

  const updateUser = async patch => {
    setUserData(prev => ({ ...prev, ...patch }));
    if (authUser && db) {
      const allowed = {};
      ['email', 'walletAddress', 'maxRiskPercent', 'maxTradeSize', 'tradingPreferences', 'apiKeyMetadata', 'securitySettings'].forEach(key => {
        if (key in patch) allowed[key] = patch[key];
      });
      if (Object.keys(allowed).length) await setDoc(doc(db, 'users', authUser.uid), { ...allowed, updatedAt: new Date() }, { merge: true });
    }
  };

  const handleSignOut = async () => {
    if (auth) await signOut(auth);
    else { localStorage.removeItem(STORAGE_KEY); setAuthUser(null); setUserData(null); }
  };

  if (loading) return <div className="kit-loader"><div className="loader-mark"><Zap size={25} /></div><div className="loader-title">KitAgent</div><div className="loader-subtitle">Initializing secure trading workspace</div><div className="loader-bar"><span /></div></div>;
  if (!authUser) return <AuthPage configured={firebaseConfigured} error={authError} />;
  if (!userData) return <div className="kit-loader"><div className="loader-mark"><ShieldCheck size={25} /></div><div className="loader-title">Access restricted</div><div className="loader-subtitle">{authError || 'This account could not be verified on this device.'}</div><button type="button" className="primary-btn loader-action" onClick={handleSignOut}>Sign out</button></div>;

  const navButton = item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => handleNavigation(item.id)} aria-current={currentPage === item.id ? 'page' : undefined} className={`nav-item ${currentPage === item.id ? 'nav-item-active' : ''}`}><Icon size={18} /><span>{item.label}</span></button>; };
  return <div className="app-shell"><aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}><div className="brand"><div className="brand-mark"><Zap size={19} /></div><div><strong>KitAgent</strong><span>Web3 Trading Terminal</span></div></div><nav className="nav-list" aria-label="Main navigation">{navigation.map(navButton)}</nav><div className="sidebar-bottom"><div className="account-mini"><WalletCards size={16} /><div><span>{userData.email || 'Portfolio'}</span><strong>${Number(userData.portfolioValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div></div><div className="status-mini"><ShieldCheck size={15} /><span>{premiumActive ? 'Premium active' : trialActive ? 'Free trial active' : 'Trial expired'}</span></div><button type="button" className="disconnect" onClick={handleSignOut}><LogOut size={16} /> Sign out</button></div></aside>{mobileMenuOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}<div className="main-shell"><header className="topbar"><button type="button" className="mobile-menu" onClick={() => setMobileMenuOpen(v => !v)} aria-label="Open navigation">{mobileMenuOpen ? <X /> : <Menu />}</button><div><span className="eyebrow">WORKSPACE</span><h2>{navigation.find(item => item.id === currentPage)?.label}</h2></div><div className="topbar-meta"><span className={`access-pill ${access}`}>{access === 'premium' ? 'PREMIUM' : access === 'trial' ? 'TRIAL' : 'EXPIRED'}</span><span className="network-dot"><span /> Wallet-only signing</span></div></header>{authError && <div className="auth-inline-error">{authError}</div>}<main className="page-content">{currentPage === 'terminal' && <TerminalPage userData={userData} access={access} updateUser={updateUser} />}{currentPage === 'trading' && <TradingPage userData={userData} access={access} />}{currentPage === 'history' && <HistoryPage userData={userData} access={access} />}{currentPage === 'track' && <TrackRecordPage userData={userData} access={access} />}{currentPage === 'profile' && <ProfilePage userData={userData} access={access} updateUser={updateUser} trialEndsAt={trialEndsAt} />}</main></div></div>;
}
