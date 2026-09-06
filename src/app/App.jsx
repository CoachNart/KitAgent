import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, ChartNoAxesCombined, Clock3, History, LogOut, Menu, ShieldCheck, UserRound, WalletCards, X, Zap } from 'lucide-react';
import TerminalPage from '../pages/TerminalPage';
import TradingPage from '../pages/TradingPage';
import HistoryPage from '../pages/HistoryPage';
import ProfilePage from '../pages/ProfilePage';
import TrackRecordPage from '../pages/TrackRecordPage';

const STORAGE_KEY = 'kitagent.demo.user.v2';
const DEVICE_KEY = 'kitagent.device.v2';

const navigation = [
  { id: 'terminal', label: 'Terminal', icon: Bot },
  { id: 'trading', label: 'Trading', icon: ChartNoAxesCombined },
  { id: 'history', label: 'Transactions', icon: History },
  { id: 'track', label: 'Track Record', icon: Activity },
  { id: 'profile', label: 'Profile', icon: UserRound },
];

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function defaultUser() {
  return {
    id: 'demo-user',
    walletAddress: '0x742d…5f39',
    portfolioValue: 24580.5,
    registeredAt: new Date().toISOString(),
    premiumUntil: null,
    deviceId: getDeviceId(),
    maxRiskPercent: 1.5,
    maxTradeSize: 1000,
  };
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('terminal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userData, setUserData] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved?.registeredAt ? { ...defaultUser(), ...saved, deviceId: saved.deviceId || getDeviceId() } : defaultUser();
    } catch {
      return defaultUser();
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
  }, [userData]);

  const trialEndsAt = useMemo(() => new Date(new Date(userData.registeredAt).getTime() + 3 * 24 * 60 * 60 * 1000), [userData.registeredAt]);
  const premiumActive = userData.premiumUntil && new Date(userData.premiumUntil) > new Date();
  const trialActive = trialEndsAt > new Date();
  const access = premiumActive ? 'premium' : trialActive ? 'trial' : 'expired';

  const handleNavigation = (page) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
  };

  const updateUser = (patch) => setUserData((prev) => ({ ...prev, ...patch }));

  const navButton = (item) => {
    const Icon = item.icon;
    return (
      <button key={item.id} type="button" onClick={() => handleNavigation(item.id)} aria-current={currentPage === item.id ? 'page' : undefined}
        className={`nav-item ${currentPage === item.id ? 'nav-item-active' : ''}`}>
        <Icon size={18} /> <span>{item.label}</span>
      </button>
    );
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Zap size={19} /></div>
          <div><strong>KitAgent</strong><span>Web3 Trading Terminal</span></div>
        </div>
        <nav className="nav-list" aria-label="Main navigation">{navigation.map(navButton)}</nav>
        <div className="sidebar-bottom">
          <div className="account-mini">
            <WalletCards size={16} />
            <div><span>Portfolio</span><strong>${userData.portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
          </div>
          <div className="status-mini"><ShieldCheck size={15} /><span>{premiumActive ? 'Premium active' : trialActive ? 'Free trial active' : 'Trial expired'}</span></div>
          <button type="button" className="disconnect" onClick={() => updateUser({ walletAddress: null })}><LogOut size={16} /> Disconnect wallet</button>
        </div>
      </aside>

      {mobileMenuOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button type="button" className="mobile-menu" onClick={() => setMobileMenuOpen((v) => !v)} aria-label="Open navigation">{mobileMenuOpen ? <X /> : <Menu />}</button>
          <div><span className="eyebrow">WORKSPACE</span><h2>{navigation.find((item) => item.id === currentPage)?.label}</h2></div>
          <div className="topbar-meta"><span className={`access-pill ${access}`}>{access === 'premium' ? 'PREMIUM' : access === 'trial' ? 'TRIAL' : 'EXPIRED'}</span><span className="network-dot"><span /> Wallet-only signing</span></div>
        </header>
        <main className="page-content">
          {currentPage === 'terminal' && <TerminalPage userData={userData} access={access} updateUser={updateUser} />}
          {currentPage === 'trading' && <TradingPage userData={userData} access={access} />}
          {currentPage === 'history' && <HistoryPage userData={userData} access={access} />}
          {currentPage === 'track' && <TrackRecordPage userData={userData} access={access} />}
          {currentPage === 'profile' && <ProfilePage userData={userData} access={access} updateUser={updateUser} trialEndsAt={trialEndsAt} />}
        </main>
      </div>
    </div>
  );
}
