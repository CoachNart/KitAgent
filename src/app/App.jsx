import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import TerminalPage from '../pages/TerminalPage';
import TradingPage from '../pages/TradingPage';
import HistoryPage from '../pages/HistoryPage';
import SignalsPage from '../pages/SignalsPage';
import TrackRecordPage from '../pages/TrackRecordPage';
import ProfilePage from '../pages/ProfilePage';
import { navigation, pageFromPath } from '../data/navigation';

const pages = { terminal: TerminalPage, trading: TradingPage, history: HistoryPage, signals: SignalsPage, track: TrackRecordPage, profile: ProfilePage };

export default function App() {
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  useEffect(() => { const handler = () => setPage(pageFromPath(window.location.pathname)); window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler); }, []);
  const navigate = (id) => { const item = navigation.find((x) => x.id === id); if (!item) return; window.history.pushState({}, '', item.path); setPage(id); window.scrollTo(0, 0); };
  const Page = pages[page] || TerminalPage;
  return <Layout page={page} onNavigate={navigate}><Page /></Layout>;
}
