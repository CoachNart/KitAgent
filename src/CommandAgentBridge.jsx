import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, ShieldAlert, Terminal, X } from 'lucide-react';
import { executePreparedPlan, planCommand } from './agentRuntime.js';
import { getConnectedAddress } from './walletConnector.js';

function short(v){return v?`${v.slice(0,6)}…${v.slice(-4)}`:'';}
function clearInput(el){if(!el)return;el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));}

export default function CommandAgentBridge({ children }) {
  const [entries,setEntries]=useState([]);
  const [pending,setPending]=useState(null);
  const [busy,setBusy]=useState(false);
  const [target,setTarget]=useState(null);

  useEffect(()=>{
    const find=()=>document.querySelector('.command-page .command-card .terminal-output');
    const update=()=>{const el=find();if(el)setTarget(el);};
    update();
    const observer=new MutationObserver(update);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{if(target)target.scrollTop=target.scrollHeight;},[target,entries,pending,busy]);

  const run=useCallback(async raw=>{
    const command=String(raw||'').trim();
    if(!command||busy)return;
    const wallet=getConnectedAddress()||'';
    setEntries(e=>[...e,{id:`u-${Date.now()}`,role:'user',text:command}]);
    setBusy(true);
    try{
      const result=await planCommand({command,wallet});
      if(result?.status==='ready'&&result.execution){
        const execution=result.execution;const quote=execution.quote;
        const summary=execution.title||(
          result.intent==='swap'?`Swap prepared · ${quote?.sellAmount||execution.metadata?.amountIn||''} → ${quote?.buyAmount||execution.metadata?.quotedOut||''}`:
          result.intent==='bridge'?`Bridge prepared · ${quote?.sellAmount||''} → ${quote?.quotedBuyAmount||''}`:
          'Transaction prepared and simulated'
        );
        setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:summary,meta:{intent:result.intent,execution}}]);
        setPending({intent:result.intent,execution,wallet});
      }else if(result?.kind){
        setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:result.message||'Task received.',meta:{result}}]);
      }else{
        setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:result?.message||'I could not prepare that task.',meta:{result}}]);
      }
    }catch(error){setEntries(e=>[...e,{id:`e-${Date.now()}`,role:'agent',text:error?.message||'Execution planning failed.',meta:{error:true}}]);}
    finally{setBusy(false);}
  },[busy]);

  const onClickCapture=useCallback(e=>{
    const runButton=e.target?.closest?.('.run-btn');const suggestion=e.target?.closest?.('.suggestions button');
    if(!runButton&&!suggestion)return;e.preventDefault();e.stopPropagation();
    const textarea=document.querySelector('.command-card .command-input textarea');const text=runButton?(textarea?.value||''):suggestion?.textContent||'';
    clearInput(textarea);if(text)run(text);
  },[run]);

  const onKeyDownCapture=useCallback(e=>{if(e.target?.matches?.('.command-card .command-input textarea')&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();e.stopPropagation();const text=e.target.value;clearInput(e.target);run(text);}},[run]);

  const approve=useCallback(async()=>{if(!pending||busy)return;setBusy(true);setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:'Approval received. Executing and waiting for on-chain confirmation…',meta:{executionState:'executing'}}]);try{const result=await executePreparedPlan({execution:pending.execution,wallet:pending.wallet});const hashes=result.hashes||[result.hash].filter(Boolean);setEntries(e=>[...e,{id:`a-${Date.now()}`,role:'agent',text:`Verified on-chain · ${hashes.map(short).join(', ')}`,meta:{result,success:true}}]);setPending(null);}catch(error){setEntries(e=>[...e,{id:`e-${Date.now()}`,role:'agent',text:error?.message||'Wallet rejected or transaction failed.',meta:{error:true}}]);}finally{setBusy(false);}},[pending,busy]);
  const cancel=useCallback(()=>setPending(null),[]);

  const portal=useMemo(()=>{if(!target)return null;return createPortal(<div className="bridge-terminal-history">
    {entries.map(entry=><div key={entry.id} className={`term-message ${entry.role==='user'?'user':''}`}><div className="term-avatar">{entry.role==='user'?null:<Terminal size={11}/>}</div><div className="term-body"><small>{entry.role==='user'?'YOU':'KITAGENT'}</small><p>{entry.text}</p>
      {entry.meta?.execution&&<div className="agent-execution-card"><div className="agent-execution-head"><span><Terminal size={13}/> LIVE EXECUTION PLAN</span><b>{String(entry.meta.intent||'ACTION').toUpperCase()}</b></div><div className="agent-execution-grid"><div><small>ADAPTER</small><b>{entry.meta.execution.adapter||'agent'}</b></div><div><small>STEPS</small><b>{entry.meta.execution.transactions?.length||1}</b></div><div><small>CHAIN</small><b>{entry.meta.execution.chainId||4663}</b></div><div><small>STATE</small><b>{entry.meta.execution.state||'prepared'}</b></div></div><div className="agent-execution-warning"><ShieldAlert size={14}/><span>Simulation completed where safe. Nothing is signed until you approve.</span></div></div>}
      {entry.meta?.result?.result?.best&&<div className="agent-execution-card"><div className="agent-execution-head"><span><Terminal size={13}/> MORPHO LIVE DATA</span><b>READ ONLY</b></div><div className="agent-execution-grid"><div><small>BEST</small><b>{entry.meta.result.result.best.name||entry.meta.result.result.best.symbol||'Market'}</b></div><div><small>APY</small><b>{entry.meta.result.result.best.avgNetApyExcludingRewards??entry.meta.result.result.best.supplyApy??'—'}</b></div><div><small>TVL</small><b>${Number(entry.meta.result.result.best.totalAssetsUsd??entry.meta.result.result.best.tvl??0).toLocaleString()}</b></div><div><small>LIQUIDITY</small><b>${Number(entry.meta.result.result.best.liquidityUsd??entry.meta.result.result.best.liquidity??0).toLocaleString()}</b></div></div></div>}
      {entry.meta?.success&&<div className="agent-execution-warning success"><Check size={14}/><span>Receipt confirmed and verified on-chain.</span></div>}
    </div></div>)}
    {busy&&<div className="term-message"><div className="term-avatar"><LoaderCircle className="spin" size={11}/></div><div className="term-body"><small>KITAGENT</small><p>Planning, quoting and validating the next on-chain step…</p></div></div>}
    {pending&&<div className="agent-permission-card"><div className="agent-permission-head"><div><small>PERMISSION CHECKPOINT</small><h4>Approve {pending.intent}?</h4></div><button onClick={cancel}><X size={14}/></button></div><div className="agent-permission-body"><div><span>FROM</span><b>{short(pending.wallet||getConnectedAddress()||'')}</b></div><div><span>TX STEPS</span><b>{pending.execution.transactions?.length||1}</b></div><div><span>ADAPTER</span><b>{pending.execution.adapter||'native'}</b></div><div><span>CHAIN</span><b>{pending.execution.chainId||4663}</b></div></div><div className="agent-permission-actions"><button onClick={cancel}>Cancel</button><button onClick={approve} disabled={busy}><Check size={14}/> Sign & execute</button></div><p>Your wallet remains the signer. KitAgent never receives your private key.</p></div>}
  </div>,target);},[target,entries,pending,busy,cancel,approve]);

  return <div onClickCapture={onClickCapture} onKeyDownCapture={onKeyDownCapture}>{children}{portal}</div>;
}
