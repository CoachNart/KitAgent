import { useState } from 'react';
import { Activity, BarChart3, History, Terminal, UserRound, ShieldCheck } from 'lucide-react';

const nav = [
  ['terminal', 'Terminal', Terminal],
  ['trading', 'Trading', BarChart3],
  ['history', 'Transactions', History],
  ['track', 'Track Record', Activity],
  ['profile', 'Profile', UserRound],
];

function App() {
  const [page, setPage] = useState('terminal');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">K</span><div><strong>KitAgent</strong><small>Web3 Trading Terminal</small></div></div>
        <nav>{nav.map(([id, label, Icon]) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}><Icon size={18}/><span>{label}</span></button>)}</nav>
        <div className="sidebar-foot"><ShieldCheck size={16}/><span>Non-custodial</span></div>
      </aside>

      <main className="main">
        <header className="topbar"><div><span className="eyebrow">KITAGENT</span><h1>{nav.find(x => x[0] === page)?.[1]}</h1></div><div className="status"><i/>System operational</div></header>
        <section className="workspace">
          {page === 'terminal' && <TerminalHome onNavigate={setPage}/>} 
          {page !== 'terminal' && <ComingSoon title={nav.find(x => x[0] === page)?.[1]} />}
        </section>
      </main>
    </div>
  );
}

function TerminalHome({ onNavigate }) {
  const [input, setInput] = useState('');
  const examples = ['Swap 0.1 ETH to USDC', 'Show my portfolio', 'Analyze BTC/USDT on 4H', 'Bridge ETH to Base'];
  return <div className="terminal-grid">
    <section className="hero-panel"><div className="hero-copy"><span className="pill">AI TRADING TERMINAL</span><h2>Trade smarter.<br/><em>Understand every move.</em></h2><p>Use natural language to interact with Web3, inspect markets and execute only when the conditions make sense.</p></div>
      <div className="command-box"><div className="command-label"><span>COMMAND</span><span>Natural language enabled</span></div><textarea value={input} onChange={e => setInput(e.target.value)} placeholder="What do you want to do?"/><button className="primary" onClick={() => setInput('')}>Run command <span>↵</span></button></div>
      <div className="examples"><span>Try an example</span>{examples.map(x => <button key={x} onClick={() => setInput(x)}>{x}</button>)}</div>
    </section>
    <aside className="side-panel"><div className="panel-head"><div><span className="eyebrow">OVERVIEW</span><h3>Terminal status</h3></div><span className="live">LIVE</span></div><div className="metric"><span>Wallet</span><strong>Not connected</strong></div><div className="metric"><span>Network</span><strong>Ethereum</strong></div><div className="metric"><span>Risk limit</span><strong>1.5% / trade</strong></div><div className="metric"><span>Target R:R</span><strong>2.5 : 1+</strong></div><div className="notice"><ShieldCheck size={17}/><p>KitAgent never stores private keys. Sensitive actions require confirmation before execution.</p></div><button className="secondary" onClick={() => onNavigate('trading')}>Open market analysis <span>→</span></button></aside>
  </div>;
}

function ComingSoon({ title }) { return <div className="empty-panel"><span className="pill">CLEAN BUILD</span><h2>{title}</h2><p>This module is being rebuilt from the KitAgent product brief. No legacy UI is being carried forward.</p></div>; }

export default App;
