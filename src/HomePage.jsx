import { ArrowRight, BarChart3, Bot, ShieldCheck, Terminal } from 'lucide-react';
import './home-page.css';

export default function HomePage({ onNavigate, onOpenAgent }) {
  return (
    <main className="ks-home">
      <section className="ks-hero">
        <div className="ks-hero-grid" aria-hidden="true" />
        <div className="ks-hero-inner">
          <div className="ks-hero-copy">
            <div className="ks-eyebrow"><span /> THE CRYPTO COMMAND CENTER</div>
            <h1>Trade crypto<br /><em>with intent.</em></h1>
            <p className="ks-hero-lead">One intelligent workspace for market analysis, execution and on-chain operations.</p>
            <div className="ks-hero-actions">
              <button className="ks-primary" onClick={() => onOpenAgent?.()}><Bot size={16} /> Open KitAgent <ArrowRight size={15} /></button>
              <button className="ks-secondary" onClick={() => onNavigate?.('markets')}>Explore markets</button>
            </div>
            <div className="ks-trust-row">
              <span><ShieldCheck size={13} /> Non-custodial by design</span>
              <span><span className="ks-status-dot" /> Live market data</span>
            </div>
          </div>

          <div className="ks-hero-terminal" aria-label="KitSetups command terminal">
            <div className="ks-terminal-bar">
              <div className="ks-window-dots"><i /><i /><i /></div>
              <span>kitsetups / command</span>
              <b>LIVE</b>
            </div>
            <div className="ks-terminal-body">
              <div className="ks-terminal-topline"><span>MARKET</span><strong>BTC / USDT</strong><span className="ks-positive">+2.84%</span></div>
              <div className="ks-chart-shell">
                <div className="ks-chart-grid" />
                <svg className="ks-chart" viewBox="0 0 700 280" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 222 L45 205 L82 216 L118 180 L155 194 L193 153 L225 166 L266 132 L303 146 L345 103 L382 119 L423 92 L460 112 L500 70 L536 87 L575 55 L612 73 L650 38 L700 48" />
                  <path className="ks-chart-fill" d="M0 222 L45 205 L82 216 L118 180 L155 194 L193 153 L225 166 L266 132 L303 146 L345 103 L382 119 L423 92 L460 112 L500 70 L536 87 L575 55 L612 73 L650 38 L700 48 L700 280 L0 280Z" />
                </svg>
                <div className="ks-price-tag">$112,840.20</div>
              </div>
              <div className="ks-terminal-bottom">
                <div><small>POSITION</small><strong>LONG BTCUSDT</strong></div>
                <div><small>LEVERAGE</small><strong>25×</strong></div>
                <div><small>RISK</small><strong className="ks-positive">LOW</strong></div>
                <button onClick={() => onOpenAgent?.()}>EXECUTE <ArrowRight size={13} /></button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ks-hero-foot">
        <span><Terminal size={14} /> EXECUTION</span>
        <span><BarChart3 size={14} /> MARKET INTELLIGENCE</span>
        <span><Bot size={14} /> AI-ASSISTED WORKFLOWS</span>
      </section>
    </main>
  );
}
