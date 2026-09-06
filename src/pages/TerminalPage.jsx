import React, { useState } from 'react';
import { detectIntent, faucetLinks, respondToIntent } from '../services/terminalAgent';
import { connectWallet, isWalletAvailable } from '../services/wallet';

export default function TerminalPage() {
  const [messages, setMessages] = useState([{ role: 'agent', text: 'Welcome. Tell me what you want to do. I will explain the action, show what is missing, and wait for your approval before a wallet transaction.' }]);
  const [input, setInput] = useState('');
  const [wallet, setWallet] = useState(null);
  const suggestions = ['Swap ETH to USDC', 'Send 0.1 ETH', 'Bridge to Base', 'Get Sepolia faucet', 'Send my NFT'];
  const run = () => {
    const q = input.trim(); if (!q) return;
    const result = respondToIntent(q);
    let extra = '';
    if (result.intent === 'faucet' && /sepolia/i.test(q)) extra = faucetLinks('Sepolia').map((x) => `• ${x.name}: ${x.url}`).join('\n');
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'agent', text: extra ? `${result.text}\n\n${extra}` : result.text }]);
    setInput('');
  };
  const walletAction = async () => { try { setWallet(await connectWallet()); } catch (e) { setMessages((m) => [...m, { role: 'agent', text: e.message }]); } };
  return <section className="terminal-page">
    <div className="terminal-shell">
      <div className="terminal-top"><span>AGENT CONSOLE</span><span>SAFE MODE · NO SILENT SIGNING</span></div>
      <div className="messages">{messages.map((m, i) => <div className={`msg ${m.role}`} key={i}><b>{m.role === 'agent' ? 'KITAGENT' : 'YOU'}</b><p>{m.text}</p></div>)}</div>
      <div className="suggestions">{suggestions.map((x) => <button key={x} onClick={() => setInput(x)}>{x}</button>)}</div>
      <div className="composer"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }} placeholder="Ask KitAgent to do something…"/><button onClick={run}>PREPARE <span>↵</span></button></div>
    </div>
    <div className="terminal-grid">
      <div className="mini"><span>WALLET</span><strong>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Not connected'}</strong><button onClick={walletAction}>{wallet ? 'CONNECTED' : isWalletAvailable() ? 'CONNECT EVM' : 'NO WALLET'}</button></div>
      {[['Swap','Quote → price impact → gas → approval.'],['Bridge','Source → destination → route → approval.'],['Transfer','Recipient → amount → validation → approval.'],['Faucet','Verified testnet sources only.']].map(([a,b]) => <div className="mini" key={a}><span>{a}</span><p>{b}</p></div>)}
    </div>
  </section>;
}
