import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, ShieldAlert, Terminal, X, ExternalLink } from 'lucide-react';
import { executePreparedPlan, planCommand } from './agentRuntime.js';
import { getConnectedAddress } from './walletConnector.js';

function short(v){return v?`${v.slice(0,6)}…${v.slice(-4)}`:'';}
function formatUnitsSafe(value,decimals=18){try{const n=BigInt(value);const d=10n**BigInt(decimals);const w=n/d;const f=(n%d).toString().padStart(decimals,'0').replace(/0+$/,'');return f?`${w}.${f}`:w.toString();}catch{return String(value??'');}}

export default function CommandAgentBridge({ children }) {
  const [entries,setEntries]=useState([]);
  const [pending,setPending]=useState(null);
  const [busy,setBusy]=useState(false);
  const [target,setTarget]=useState(null);

  useEffect(()=>{
    const observer=new MutationObserver(()=>{
      const el=document.querySelector('.conversation');
      if(el)setTarget(el);
    });
    observer.observe(document.body,{childList:true,subtree:true});
    const el=document.querySelector('.conversation');
    if(el)setTarget(el);
    return()=>observer.disconnect();
  },[]);

  const run=useCallback(async raw=>{
    const command=String(raw||'').trim();
    if(!command||busy)return;
    const wallet=getConnectedAddress()||'';
    setEntries(e=>[...e,{id:`u-${Date.now()}`,role:'user',text:command}]);
    setBusy(true);
    try{
      const result=await planCommand({command,wallet});
      if(result?.status==='ready' && result.execution){
        const execution=result.execution;
        const quote=execution.quote;
        const summary=execution.summary||(
          result.intent==='swap'
            ? `Swap ${quote?.sellAmount||''} → ${quote?.buyAmount||''}`
            : result.intent==='bridge'
              ? `Bridge ${quote?.sellAmount||''} → ${quote?.quotedBuyAmount||''}`
              : execution.summary||'Transaction ready'
        );
        setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:summary,meta:{intent:result.intent,execution}}]);
        setPending({intent:result.intent,execution});
      } else if(result?.kind==='defi-opportunity' || result?.kind==='action-plan' || result?.kind==='wallet-read' || result?.kind==='market-read' || result?.kind==='help') {
        setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:result.message||'Task received.',meta:{result}}]);
      } else {
        setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:result?.message||'I could not prepare that task.',meta:{result}}]);
      }
    }catch(error){
      setEntries(e=>[...e,{id:`e-${Date.now()}`,role:'agent',text:error?.message||'Execution planning failed.'}]);
    }finally{setBusy(false);}
  },[busy]);

  const onClickCapture=useCallback(e=>{
    const runButton=e.target?.closest?.('.run-btn');
    const suggestion=e.target?.closest?.('.suggestions button');
    if(!runButton&&!suggestion)return;
    e.preventDefault();
    e.stopPropagation();
    const textarea=document.querySelector('.command-input textarea');
    const text=runButton?(textarea?.value||''):suggestion?.textContent||'';
    if(text)run(text);
  },[run]);

  const onKeyDownCapture=useCallback(e=>{
    if(e.target?.matches?.('.command-input textarea')&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){
      e.preventDefault();
      e.stopPropagation();
      run(e.target.value);
    }
  },[run]);

  const approve=useCallback(async()=>{
    if(!pending||busy)return;
    setBusy(true);
    try{
      const result=await executePreparedPlan({execution:pending.execution});
      setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:`Transaction submitted: ${short(result.hash)}`,meta:{result,success:true}}]);
      setPending(null);
    }catch(error){
      setEntries(e=>[...e,{id:`e-${Date.now()}`,role:'agent',text:error?.message||'Wallet rejected or transaction failed.',meta:{error:true}}]);
    }finally{setBusy(false);}
  },[pending,busy]);

  const cancel=useCallback(()=>setPending(null),[]);

  const portal=useMemo(()=>{
    if(!target)return null;
    return createPortal(
      <>
        {entries.map(entry=><div key={entry.id} className={entry.role==='user'?'message user-message':'message agent-message'}>
          <span className="message-mark">{entry.role==='user'?null:<Terminal size={13}/>}</span>
          <div><small>{entry.role==='user'?'YOU':'KITAGENT'}</small><p>{entry.text}</p>
            {entry.meta?.execution&&<div className="agent-execution-card">
              <div className="agent-execution-head"><span><Terminal size={13}/> LIVE EXECUTION PLAN</span><b>{String(entry.meta.intent||'ACTION').toUpperCase()}</b></div>
              <div className="agent-execution-grid">
                {entry.meta.execution.adapter&&<div><small>ADAPTER</small><b>{entry.meta.execution.adapter}</b></div>}
                {entry.meta.execution.quote?.buyAmount&&<div><small>EXPECTED OUTPUT</small><b>{formatUnitsSafe(entry.meta.execution.quote.buyAmount)}</b></div>}
                {entry.meta.execution.quote?.estimatedTimeSeconds&&<div><small>EST. TIME</small><b>{entry.meta.execution.quote.estimatedTimeSeconds}s</b></div>}
                <div><small>NETWORK</small><b>{entry.meta.execution.network||'Robinhood Chain'}</b></div>
              </div>
              <div className="agent-execution-warning"><ShieldAlert size={14}/><span>Nothing is signed until you approve the exact transaction below.</span></div>
            </div>}
            {entry.meta?.result?.result?.best&&<div className="agent-execution-card"><div className="agent-execution-head"><span><Terminal size={13}/> MORPHO LIVE DATA</span><b>READ ONLY</b></div><div className="agent-execution-grid"><div><small>BEST</small><b>{entry.meta.result.result.best.name||entry.meta.result.result.best.symbol||'Market'}</b></div><div><small>APY</small><b>{entry.meta.result.result.best.avgNetApyExcludingRewards??entry.meta.result.result.best.supplyApy??'—'}</b></div><div><small>TVL</small><b>${Number(entry.meta.result.result.best.totalAssetsUsd??entry.meta.result.result.best.tvl??0).toLocaleString()}</b></div></div></div>}
          </div>
        </div>)}
        {busy&&<div className="message agent-message"><span className="message-mark"><LoaderCircle className="spin" size={13}/></span><div><small>KITAGENT</small><p>Planning and validating the next on-chain step…</p></div></div>}
        {pending&&<div className="agent-permission-card"><div className="agent-permission-head"><div><small>PERMISSION CHECKPOINT</small><h4>Approve {pending.intent}?</h4></div><button onClick={cancel}><X size={14}/></button></div><div className="agent-permission-body"><div><span>FROM</span><b>{short(getConnectedAddress()||'')}</b></div><div><span>TO</span><b>{short(pending.execution.transaction?.to||'')}</b></div><div><span>VALUE</span><b>{pending.execution.transaction?.value||'0x0'}</b></div><div><span>ADAPTER</span><b>{pending.execution.adapter||'native'}</b></div></div><div className="agent-permission-actions"><button onClick={cancel}>Cancel</button><button onClick={approve} disabled={busy}><Check size={14}/> Sign & execute</button></div><p>Wallet confirmation is still required. KitAgent never receives your private key.</p></div>}
      </>,target);
  },[target,entries,pending,busy,cancel,approve]);

  return <div onClickCapture={onClickCapture} onKeyDownCapture={onKeyDownCapture}>{children}{portal}</div>;
}
