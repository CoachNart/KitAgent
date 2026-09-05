import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const stages = [
  ['01', 'UNDERSTAND', 'Parse intent'],
  ['02', 'VERIFY', 'Check balances + risk'],
  ['03', 'SIMULATE', 'Preview the route'],
  ['04', 'EXECUTE', 'Await approval'],
];

function Icon({ name }) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  const paths = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5z" />
        <path d="M4 8h15" />
        <path d="M15.5 13h.01" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" />
        <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" {...p}>
      {paths[name]}
    </svg>
  );
}

function App() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [intent, setIntent] = useState('');
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);

  async function connect() {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        setAddress(accounts[0]);
        setConnected(true);
      } catch (error) {
        // User rejected the wallet request.
      }
    } else {
      setConnected(true);
      setAddress('Demo wallet');
    }
  }

  function run() {
    if (!intent.trim()) return;

    setRunning(true);
    setStage(0);

    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setStage(i);

      if (i === 3) {
        clearInterval(timer);
      }
    }, 850);
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>
              KIT<span>AGENT</span>
            </strong>
            <small>ONCHAIN INTENT ENGINE</small>
          </div>
        </div>

        <div className="top-actions">
          <div className="network">
            <i /> Ethereum <b>⌄</b>
          </div>
          <button className="connect" onClick={connect}>
            {connected ? (
              <>
                <span className="dot" />
                {address.slice(0, 6)}…{address.slice(-4)}
              </>
            ) : (
              'Connect wallet'
            )}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">
            <span className="live" /> AGENT ONLINE <em>•</em> 4 GUARDRAILS ACTIVE
          </div>
          <h1>
            Tell your wallet
            <br />
            <span>what you want done.</span>
          </h1>
          <p>
            KitAgent turns plain-English intent into a verified, simulated and
            approval-ready onchain action.
          </p>
        </section>

        <section className="workspace">
          <div className="side-card left">
            <div className="card-label">
              <Icon name="pulse" /> AGENT ACTIVITY
            </div>
            <div className="orb-wrap">
              <div className="orb">
                <div className="orb-core" />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="activity-title">
              {running
                ? ['Understanding intent', 'Verifying wallet', 'Simulating route', 'Ready for approval'][Math.min(stage, 3)]
                : 'Listening for an intent'}
            </div>
            <div className="activity-sub">
              {running
                ? 'KitAgent is working on your request.'
                : 'No transaction is being executed.'}
            </div>
            <div className="mini-bars">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="command-card">
            <div className="beam" />
            <div className="command-head">
              <div>
                <span>NEW INTENT</span>
                <small>Describe the outcome. KitAgent handles the steps.</small>
              </div>
              <div className="secure">
                <Icon name="shield" /> NON-CUSTODIAL
              </div>
            </div>

            <div className="input-wrap">
              <textarea
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
                placeholder="e.g. Swap 0.2 ETH to USDC, keep $40 for gas…"
              />
              <div className="input-foot">
                <div className="suggestions">
                  <button onClick={() => setIntent('Swap 0.2 ETH to USDC, keep $40 for gas')}>
                    Swap assets
                  </button>
                  <button onClick={() => setIntent('Send 0.1 ETH to my cold wallet')}>
                    Move funds
                  </button>
                  <button onClick={() => setIntent('Show me the safest way to bridge 500 USDC')}>
                    Bridge safely
                  </button>
                </div>
                <button className="run" onClick={run} aria-label="Run intent">
                  <Icon name="arrow" />
                </button>
              </div>
            </div>

            <div className="route">
              <span>
                <Icon name="wallet" /> Wallet
              </span>
              <b>→</b>
              <span>
                <Icon name="grid" /> Agent
              </span>
              <b>→</b>
              <span>
                <Icon name="spark" /> Protocol
              </span>
            </div>
          </div>

          <div className="side-card right">
            <div className="card-label">
              <Icon name="grid" /> EXECUTION MAP
            </div>
            <div className="stage-list">
              {stages.map((item, index) => (
                <div
                  className={`stage ${index < stage ? 'done ' : ''}${
                    index === stage && running ? 'active' : ''
                  }`}
                  key={item[0]}
                >
                  <div className="stage-num">{index < stage ? '✓' : item[0]}</div>
                  <div>
                    <b>{item[1]}</b>
                    <small>{item[2]}</small>
                  </div>
                  <span>
                    {index < stage
                      ? 'DONE'
                      : index === stage && running
                        ? '…'
                        : '—'}
                  </span>
                </div>
              ))}
            </div>

            <div className="risk">
              <Icon name="shield" />
              <div>
                <b>Safety layer</b>
                <small>Every action is simulated before approval.</small>
              </div>
            </div>
          </div>
        </section>

        <section className="ticker">
          <span>SUPPORTED NOW</span>
          <b>ETH</b>
          <b>USDC</b>
          <b>BASE</b>
          <b>ARBITRUM</b>
          <b>UNISWAP</b>
          <b>AAVE</b>
          <span className="right-note">YOUR KEYS · YOUR APPROVAL · YOUR CONTROL</span>
        </section>
      </main>

      <footer>
        <span>KitAgent</span>
        <span>Intent → Verify → Simulate → Execute</span>
        <span>v0.1 prototype</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
