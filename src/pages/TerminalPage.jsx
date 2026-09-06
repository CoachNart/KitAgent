import React, { useMemo, useState } from 'react';
import { faucetLinks, respondToIntent } from '../services/terminalAgent';
import { connectWallet, isWalletAvailable } from '../services/wallet';
import { CAPABILITIES } from '../data/capabilities';

export default function TerminalPage() {
  const [messages, setMessages] = useState([{ role: 'agent', text: 'KitAgent is ready. Tell me what you want to do on-chain in plain English. I prepare the route first, surface fees and risk, then wait for your confirmation and wallet approval.' }]);
  const [input, setInput] = useState('');
  const [wallet, setWallet] = useState(null);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const groups = useMemo(() => CAPABILITIES.reduce((acc, item) => { (acc[item.group] ||= []).push(item); return acc; }, {}), []);
  const suggestions = ['Swap ETH → USDC', 'Bridge to Base', 'Send an NFT', 'Stake ETH', 'Lend USDC', 'Estimate gas'];

  const submit = (value = input) => {
    const q = value.trim(); if (!q) return;
    const result = respondToIntent(q);
    let extra = '';
    if (result.intent === 'faucet') {
      const network = /sepolia/i.test(q) ? 'Sepolia' : null;
      if (network) extra = faucetLinks(network).map((x) => `• ${x.name}: ${x.url}`).join('\n');
    }
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'agent', text: extra ? `${result.text}\n\n${extra}` : result.text }]);
    setInput('');
  };
  const walletAction = async () => { try { setWallet(await connectWallet()); } catch (e) { setMessages((m) => [...m, { role: 'agent', text: e.message }]); } };
  const chooseCapability = (cap) => { setInput(cap.label); setShowCapabilities(false); };

  return <section className="terminal-page page">
    <div className="terminal-intro">
      <div>
        <div className="section-kicker">UNIVERSAL ON-CHAIN AGENT</div>
        <h2>Tell it what<br /><span>you want done.</span></h2>
      </div>
      <p className="intro-copy">One command layer for swaps, bridges, DeFi, NFTs, transfers, gas and on-chain actions. No guessing. No silent signing.</p>
    </div>

    <div className="terminal-shell">
      <div className="terminal-top">
        <div className="console-brand"><i /> KITAGENT <span>CONSOLE</span></div>
        <div className="console-state"><i /> SAFE EXECUTION</div>
      </div>
      <div className="messages">{messages.map((m, i) => <div className={`msg ${m.role}`} key={i}><b>{m.role === 'agent' ? 'KITAGENT' : 'YOU'}</b><p>{m.text}</p></div>)}</div>
      <div className="terminal-actions">
        <button className="capability-toggle" onClick={() => setShowCapabilities((v) => !v)}>{showCapabilities ? 'CLOSE COMMAND INDEX' : '＋ COMMAND INDEX'}</button>
        {showCapabilities && <div className="capability-panel">{Object.entries(groups).map(([group, items]) => <div className="cap-group" key={group}><small>{group}</small>{items.map((cap) => <button key={cap.id} onClick={() => chooseCapability(cap)}><strong>{cap.label}</strong><span>{cap.description}</span></button>)}</div>)}</div>}
      </div>
      <div className="suggestions">{suggestions.map((x) => <button key={x} onClick={() => setInput(x)}>{x}</button>)}</div>
      <div className="composer"><div className="prompt-mark">›</div><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="Describe a transaction or ask KitAgent anything…"/><button onClick={() => submit()}>PREPARE <span>↗</span></button></div>
    </div>

    <div className="terminal-meta-grid">
      <div className="meta-block wallet-block"><div className="meta-label">WALLET</div><strong>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'NOT CONNECTED'}</strong><button onClick={walletAction}>{wallet ? 'CONNECTED' : isWalletAvailable() ? 'CONNECT WALLET' : 'WALLET UNAVAILABLE'}</button></div>
      <div className="meta-block"><div className="meta-index">01</div><div><div className="meta-label">DEFI</div><p>Swap · Bridge · Lending · LP · Staking · Yield · Approvals</p></div></div>
      <div className="meta-block"><div className="meta-index">02</div><div><div className="meta-label">NFT</div><p>Discover · Buy · Sell · List · Offers · Transfer</p></div></div>
      <div className="meta-block"><div className="meta-index">03</div><div><div className="meta-label">ON-CHAIN</div><p>Gas · Airdrops · Governance · Contracts · Batch</p></div></div>
    </div>
  </section>;
}
