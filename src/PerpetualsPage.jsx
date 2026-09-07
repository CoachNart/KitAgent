import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, ChevronDown, CircleDollarSign, Loader2, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import { getActiveProvider } from './walletConnector.js';
import { LighterClient, LighterOnboarding } from '@hitesh23k/lighter-sdk/browser';

const LIGHTER_CONTRACT = '0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const ASSET_INDEX_USDG = 3;
const ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: '_to', type: 'address' }, { name: '_assetIndex', type: 'uint16' }, { name: '_routeType', type: 'uint8' }, { name: '_amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }
];
const ERC20_ABI = [ABI[1]];
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'LINK', 'AVAX', 'SUI'];
const LEVERAGES = [2, 3, 5, 10, 20];

const money = (n, digits = 2) => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const compact = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'Not connected';
const toUnits = value => String(Math.max(0, Number(value) || 0)).replace(/[^0-9.]/g, '');

export default function PerpetualsPage({ wallet, connectWallet }) {
  const [symbol, setSymbol] = useState('BTC');
  const [markets, setMarkets] = useState([]);
  const [market, setMarket] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [positions, setPositions] = useState([]);
  const [balance, setBalance] = useState(null);
  const [leverage, setLeverage] = useState(5);
  const [side, setSide] = useState('long');
  const [orderType, setOrderType] = useState('market');
  const [margin, setMargin] = useState('100');
  const [limitPrice, setLimitPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [client, setClient] = useState(null);
  const [signer, setSigner] = useState(null);

  const selectedPrice = Number(ticker?.price || market?.last_price || 0);
  const positionSize = (Number(margin) || 0) * leverage;
  const estimatedQty = selectedPrice > 0 ? positionSize / selectedPrice : 0;

  const loadPublic = async (c = client) => {
    setLoading(true);
    try {
      const next = c || new LighterClient({ venue: 'robinhood', isMainnet: true });
      if (!markets.length) {
        const ms = await next.markets();
        setMarkets(ms || []);
      }
      const m = next.market(symbol);
      setMarket(m || null);
      if (m?.market_id != null) {
        try {
          const trades = await next.rest.getRecentTrades(m.market_id, 1);
          const last = Array.isArray(trades) ? trades[0] : null;
          setTicker(last ? { price: Number(last.price || last.p || 0) } : null);
        } catch { setTicker(null); }
      }
      setClient(next);
    } catch (e) {
      setNotice(e?.message || 'Unable to load Lighter market data.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadPublic(); }, []);
  useEffect(() => {
    if (!client) return;
    const timer = setInterval(() => loadPublic(client), 12000);
    return () => clearInterval(timer);
  }, [client, symbol]);

  useEffect(() => {
    if (!client || !signer) return;
    const loadAccount = async () => {
      try {
        const p = await client.getPositions();
        setPositions(Array.isArray(p) ? p : []);
        const account = signer.accountIndex != null ? await client.rest.getAccount(signer.accountIndex) : null;
        setBalance(account?.collateral ?? account?.balance ?? null);
      } catch (e) { setNotice(e?.message || 'Unable to load trading account.'); }
    };
    loadAccount();
  }, [client, signer]);

  const connectTrading = async () => {
    if (!wallet) { await connectWallet?.(); return; }
    setBusy('onboard'); setNotice('');
    try {
      const provider = getActiveProvider();
      if (!provider?.request) throw new Error('Connected wallet provider is unavailable.');
      const onboarding = new LighterOnboarding({ venue: 'robinhood', isMainnet: true });
      const result = await onboarding.registerApiKey({
        l1Address: wallet,
        l1Sign: async message => provider.request({ method: 'personal_sign', params: [message, wallet] })
      });
      const next = new LighterClient({ venue: 'robinhood', isMainnet: true, signer: result.signer });
      await next.loadMarkets();
      setSigner(result.signer);
      setClient(next);
      setNotice('Trading account connected.');
    } catch (e) { setNotice(e?.message || 'Trading-account setup was rejected.'); }
    finally { setBusy(''); }
  };

  const deposit = async () => {
    if (!wallet) { await connectWallet?.(); return; }
    const amount = Number(window.prompt('USDG amount to deposit')); if (!(amount > 0)) return;
    setBusy('deposit'); setNotice('');
    try {
      const provider = getActiveProvider();
      if (!provider?.request) throw new Error('Connected wallet provider is unavailable.');
      const amountHex = `0x${BigInt(Math.round(amount * 1e6)).toString(16)}`;
      const approveData = encodeApprove(LIGHTER_CONTRACT, amountHex);
      await provider.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: USDG, data: approveData }] });
      const depositData = encodeDeposit(wallet, ASSET_INDEX_USDG, 0, amountHex);
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: LIGHTER_CONTRACT, data: depositData }] });
      setNotice(`USDG deposit submitted: ${hash.slice(0, 10)}…`);
    } catch (e) { setNotice(e?.message || 'Deposit was rejected.'); }
    finally { setBusy(''); }
  };

  const withdraw = async () => {
    if (!signer || !client) { setNotice('Connect the Lighter trading account first.'); return; }
    const amount = Number(window.prompt('USDG amount to withdraw')); if (!(amount > 0)) return;
    setBusy('withdraw'); setNotice('');
    try {
      const tx = await client.withdraw({ amount });
      setNotice(`Withdrawal submitted${tx?.tx_hash ? `: ${tx.tx_hash.slice(0, 10)}…` : '.'}`);
    } catch (e) { setNotice(e?.message || 'Withdrawal failed.'); }
    finally { setBusy(''); }
  };

  const place = async () => {
    if (!signer || !client) { setNotice('Connect the Lighter trading account before trading.'); return; }
    if (!(positionSize > 0) || !(estimatedQty > 0)) { setNotice('Enter a positive margin amount and wait for a live market price.'); return; }
    setBusy('trade'); setNotice('');
    try {
      await client.setLeverage({ symbol, leverage });
      let tx;
      if (orderType === 'limit') {
        const price = Number(limitPrice);
        if (!(price > 0)) throw new Error('Enter a valid limit price.');
        tx = await client.placeLimitOrder({ symbol, side, size: estimatedQty, price, timeInForce: 'gtc' });
      } else {
        tx = await client.placeMarketOrder({ symbol, side, size: estimatedQty, slippage: 0.01 });
      }
      setNotice(`Order submitted${tx?.tx_hash ? `: ${tx.tx_hash.slice(0, 10)}…` : '.'}`);
      const p = await client.getPositions(); setPositions(Array.isArray(p) ? p : []);
    } catch (e) { setNotice(e?.message || 'Order was rejected.'); }
    finally { setBusy(''); }
  };

  const close = async position => {
    if (!client || !signer) return;
    setBusy(`close-${position.symbol || symbol}`); setNotice('');
    try { await client.closePosition(position.symbol || symbol); setNotice('Position close submitted.'); }
    catch (e) { setNotice(e?.message || 'Position close failed.'); }
    finally { setBusy(''); }
  };

  const currentPosition = useMemo(() => positions.find(p => String(p.symbol || '').toUpperCase() === symbol), [positions, symbol]);

  return <div className="page-wrap" style={{ maxWidth: 1440 }}>
    <div style={styles.hero}>
      <div><span style={styles.kicker}>PERPETUALS · ROBINHOOD CHAIN</span><h2 style={styles.title}>Perpetual trading</h2><p style={styles.sub}>Trade leveraged crypto perpetuals through Lighter with self-custodied USDG margin. Market analysis remains a separate read-only layer.</p></div>
      <div style={styles.heroActions}><button style={styles.secondary} onClick={deposit} disabled={busy==='deposit'}><ArrowDownToLine size={15}/> Deposit</button><button style={styles.secondary} onClick={withdraw} disabled={busy==='withdraw'}><ArrowUpRight size={15}/> Withdraw</button>{wallet ? <button style={styles.primary} onClick={connectTrading} disabled={busy==='onboard'}><ShieldCheck size={15}/>{busy==='onboard'?'Authorizing…':'Connect trading account'}</button> : <button style={styles.primary} onClick={connectWallet}><Wallet size={15}/> Connect wallet</button>}</div>
    </div>
    {notice && <div style={styles.notice}><span>{notice}</span><button onClick={()=>setNotice('')}><X size={14}/></button></div>}
    <div style={styles.marketStrip}>{SYMBOLS.map(s=><button key={s} onClick={()=>setSymbol(s)} style={s===symbol?styles.marketActive:styles.market}><b>{s}-PERP</b><small>{s===symbol&&selectedPrice?`$${money(selectedPrice)}`:'View market'}</small></button>)}</div>
    <div style={styles.grid}>
      <section style={styles.chartCard}><div style={styles.cardHead}><div><span style={styles.mini}>MARKET</span><h3>{symbol}-PERP</h3></div><button style={styles.refresh} onClick={()=>loadPublic(client)}><RefreshCw size={14}/></button></div><div style={styles.priceRow}><div><small>Mark / last</small><strong>{selectedPrice ? `$${money(selectedPrice)}` : '—'}</strong></div><div><small>Funding</small><b>Live from Lighter</b></div><div><small>Venue</small><b>Robinhood Chain</b></div></div><div style={styles.chart}><div style={styles.gridLines}/><div style={styles.chartLine}/><div style={styles.chartLabel}>{loading?'Loading market data…':'Live order-book venue'}</div></div><div style={styles.stats}><Stat label="Contract" value={market?.symbol || `${symbol}-PERP`}/><Stat label="Max leverage" value={market?.max_leverage ? `${market.max_leverage}x` : 'Venue-defined'}/><Stat label="Collateral" value="USDG"/><Stat label="Settlement" value="Lighter"/></div></section>
      <section style={styles.tradeCard}><div style={styles.cardHead}><div><span style={styles.mini}>ORDER TICKET</span><h3>Open position</h3></div><span style={styles.live}><i/> LIVE</span></div><div style={styles.tabs}><button className={side==='long'?'selected':''} onClick={()=>setSide('long')}><TrendingUp size={15}/> Long</button><button className={side==='short'?'selected short':''} onClick={()=>setSide('short')}><TrendingDown size={15}/> Short</button></div><label style={styles.label}>Order type<select value={orderType} onChange={e=>setOrderType(e.target.value)}><option value="market">Market</option><option value="limit">Limit</option></select></label>{orderType==='limit'&&<label style={styles.label}>Limit price<input inputMode="decimal" value={limitPrice} onChange={e=>setLimitPrice(e.target.value)} placeholder={selectedPrice?String(selectedPrice):'Price'}/></label>}<label style={styles.label}>Margin (USDG)<input inputMode="decimal" value={margin} onChange={e=>setMargin(toUnits(e.target.value))} placeholder="100"/></label><div style={styles.levRow}><span>Leverage</span><b>{leverage}x</b></div><div style={styles.leverage}>{LEVERAGES.map(x=><button key={x} onClick={()=>setLeverage(x)} style={x===leverage?styles.levActive:styles.lev}>{x}x</button>)}</div><div style={styles.ticketMetrics}><Stat label="Position size" value={`$${money(positionSize)}`}/><Stat label="Est. quantity" value={estimatedQty?money(estimatedQty,6):'—'}/><Stat label="Entry" value={orderType==='limit'&&limitPrice?`$${money(limitPrice)}`:'Market'}/><Stat label="Liquidation" value="Calculated by venue"/></div><button style={styles.execute} onClick={place} disabled={!!busy}>{busy==='trade'?<Loader2 size={15} className="spin"/>:<CircleDollarSign size={15}/>} {side==='long'?'Long':'Short'} {symbol} · {leverage}x</button><small style={styles.risk}>Your wallet signs the trading authorization/order. Leverage can magnify losses and liquidation can occur automatically.</small></section>
    </div>
    <div style={styles.bottomGrid}><section style={styles.positions}><div style={styles.cardHead}><div><span style={styles.mini}>ACCOUNT</span><h3>Positions</h3></div><span style={styles.balance}>{balance != null ? `$${money(balance)}` : 'Connect to load balance'}</span></div>{currentPosition ? <Position position={currentPosition} onClose={()=>close(currentPosition)} busy={busy}/> : <div style={styles.empty}>No open position for {symbol}. Your real positions will appear here after the Lighter account is connected.</div>}</section><section style={styles.positions}><div style={styles.cardHead}><div><span style={styles.mini}>MARGIN</span><h3>Trading balance</h3></div></div><div style={styles.balanceBox}><strong>{balance != null ? `$${money(balance)}` : '—'}</strong><span>Available USDG margin from Lighter</span></div><div style={styles.disclosure}>Deposits move USDG from your Robinhood Chain wallet into the Lighter contract. Closing a position returns collateral to the trading balance; withdrawals move available USDG back to your wallet.</div></section></div>
  </div>;
}

function Stat({ label, value }) { return <div style={styles.stat}><small>{label}</small><b>{value}</b></div>; }
function Position({ position, onClose, busy }) { const pnl=Number(position.unrealized_pnl ?? position.unrealizedPnl ?? position.pnl ?? 0); return <div style={styles.position}><div><b>{position.symbol || 'PERP'}</b><span>{position.side || 'Position'} · {position.leverage ? `${position.leverage}x` : 'isolated'}</span></div><div><small>Size</small><b>{position.size ?? '—'}</b></div><div><small>Entry</small><b>{position.entry_price ? `$${money(position.entry_price)}` : '—'}</b></div><div><small>Unrealized PnL</small><b style={{ color: pnl >= 0 ? '#48d597' : '#ff6874' }}>{pnl >= 0 ? '+' : ''}{money(pnl)}</b></div><button style={styles.close} onClick={onClose} disabled={!!busy}>Close</button></div>; }

function encodeApprove(spender, amountHex) { return '0x095ea7b3' + pad32(spender) + pad32(amountHex); }
function encodeDeposit(to, assetIndex, routeType, amountHex) { return '0x' + 'deposit'.split('').map(c=>c.charCodeAt(0).toString(16)).join('').padEnd(8,'0') + pad32(to) + pad32(`0x${Number(assetIndex).toString(16)}`) + pad32(`0x${Number(routeType).toString(16)}`) + pad32(amountHex); }
function pad32(v) { const raw=String(v).replace(/^0x/,'').padStart(64,'0'); return raw.slice(-64); }

const styles={hero:{display:'flex',justifyContent:'space-between',gap:20,alignItems:'flex-end',marginBottom:18},kicker:{fontSize:11,letterSpacing:'.16em',fontWeight:800,opacity:.62},title:{margin:'7px 0 5px',fontSize:34},sub:{margin:0,maxWidth:760,opacity:.65,lineHeight:1.55},heroActions:{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'},primary:{display:'inline-flex',alignItems:'center',gap:7,border:0,borderRadius:10,padding:'11px 14px',background:'#d9ff4f',color:'#071007',fontWeight:800,cursor:'pointer'},secondary:{display:'inline-flex',alignItems:'center',gap:7,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,padding:'10px 13px',background:'rgba(255,255,255,.04)',color:'inherit',fontWeight:700,cursor:'pointer'},notice:{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'10px 12px',borderRadius:10,background:'rgba(91,214,154,.08)',border:'1px solid rgba(91,214,154,.18)',marginBottom:14,fontSize:13},marketStrip:{display:'flex',gap:8,overflowX:'auto',paddingBottom:12},market:{minWidth:105,textAlign:'left',padding:'9px 10px',borderRadius:10,border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.025)',color:'inherit',cursor:'pointer'},marketActive:{minWidth:105,textAlign:'left',padding:'9px 10px',borderRadius:10,border:'1px solid rgba(217,255,79,.38)',background:'rgba(217,255,79,.08)',color:'inherit',cursor:'pointer'},grid:{display:'grid',gridTemplateColumns:'minmax(0,1.7fr) minmax(320px,.9fr)',gap:14},chartCard:{border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.025)',borderRadius:14,padding:16},tradeCard:{border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.025)',borderRadius:14,padding:16},cardHead:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10},mini:{fontSize:10,letterSpacing:'.14em',opacity:.5,fontWeight:800},priceRow:{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr',gap:10,marginTop:18},priceRow:{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr',gap:10,marginTop:18},chart:{height:330,marginTop:15,borderRadius:12,position:'relative',overflow:'hidden',background:'linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012))',border:'1px solid rgba(255,255,255,.06)'},gridLines:{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)',backgroundSize:'20% 25%'},chartLine:{position:'absolute',left:'-5%',right:'-5%',top:'42%',height:120,transform:'rotate(-5deg)',borderTop:'2px solid rgba(217,255,79,.75)',borderRadius:'50%',boxShadow:'0 -12px 30px rgba(217,255,79,.08)'},chartLabel:{position:'absolute',left:14,bottom:12,fontSize:11,opacity:.45},stats:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginTop:12},stat:{padding:'9px 10px',borderRadius:9,background:'rgba(255,255,255,.025)'},statText:{},label:{display:'grid',gap:6,fontSize:11,opacity:.75,marginTop:14},input:{},tabs:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginTop:16},levRow:{display:'flex',justifyContent:'space-between',marginTop:16,fontSize:12,opacity:.8},leverage:{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,marginTop:7},lev:{padding:'8px 4px',borderRadius:8,border:'1px solid rgba(255,255,255,.08)',background:'transparent',color:'inherit',cursor:'pointer'},levActive:{padding:'8px 4px',borderRadius:8,border:'1px solid rgba(217,255,79,.4)',background:'rgba(217,255,79,.1)',color:'inherit',cursor:'pointer'},ticketMetrics:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginTop:14},execute:{width:'100%',display:'flex',justifyContent:'center',alignItems:'center',gap:7,border:0,borderRadius:10,padding:'12px 14px',marginTop:15,background:'#d9ff4f',color:'#071007',fontWeight:900,cursor:'pointer'},risk:{display:'block',marginTop:10,opacity:.45,lineHeight:1.45},bottomGrid:{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:14,marginTop:14},positions:{border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.025)',borderRadius:14,padding:16},balance:{fontWeight:800},empty:{padding:'25px 8px',opacity:.5,fontSize:13},position:{display:'grid',gridTemplateColumns:'1.4fr .7fr .8fr 1fr auto',gap:12,alignItems:'center',marginTop:14,padding:12,borderRadius:10,background:'rgba(255,255,255,.025)'},close:{border:'1px solid rgba(255,255,255,.12)',background:'transparent',color:'inherit',padding:'8px 10px',borderRadius:8,cursor:'pointer'},balanceBox:{display:'grid',gap:4,padding:'20px 4px'},disclosure:{fontSize:12,lineHeight:1.55,opacity:.5},refresh:{border:0,background:'transparent',color:'inherit',cursor:'pointer'},live:{fontSize:10,color:'#48d597',display:'inline-flex',gap:5,alignItems:'center'},heroTitle:{},short:{} };
