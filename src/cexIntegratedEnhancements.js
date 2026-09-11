(()=>{
  // Integrated CEX enhancement layer. It augments the existing terminal DOM after each
  // native terminal render; it does not create a second page or replace #kit-cex.
  const live={balance:[],positions:[],history:[],closed:[],pairs:[],ticker:null};
  let scheduled=false;
  const arr=v=>Array.isArray(v)?v:(Array.isArray(v?.data)?v.data:[]);
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{maximumFractionDigits:6}):'—';
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

  const nativeInnerHTML=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(nativeInnerHTML?.set){
    Object.defineProperty(Element.prototype,'innerHTML',{
      configurable:true,
      enumerable:nativeInnerHTML.enumerable,
      get:nativeInnerHTML.get,
      set(value){
        nativeInnerHTML.set.call(this,value);
        if(this.id==='kit-cex') queue();
      }
    });
  }

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    const response=await nativeFetch(...args);
    try{
      const req=args[0], init=args[1];
      const body=typeof init?.body==='string'?JSON.parse(init.body):null;
      if(body?.action){
        const clone=response.clone();
        clone.json().then(data=>{
          if(body.action==='balance') live.balance=arr(data);
          else if(body.action==='positions') live.positions=arr(data);
          else if(body.action==='history') live.history=arr(data);
          else if(body.action==='positionHistory') live.closed=arr(data);
          else if(body.action==='pairs') live.pairs=arr(data);
          else if(body.action==='ticker') live.ticker=data;
          queue();
        }).catch(()=>{});
      }
    }catch{}
    return response;
  };

  const css=`
    #kit-cex .ki-account{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;margin-top:10px;border-top:1px solid #171d27;background:#171d27}
    #kit-cex .ki-stat{background:#090d13;padding:8px 9px;min-width:0}
    #kit-cex .ki-stat small{display:block;color:#657287;font-size:8px;margin-bottom:3px}
    #kit-cex .ki-stat b{font-size:11px;white-space:nowrap}
    #kit-cex .ki-live-tabs{display:flex;gap:4px;padding:8px 10px 0}
    #kit-cex .ki-live-tabs button{background:#111721;color:#aab6c7;border:1px solid #263141;border-radius:5px;padding:5px 9px;font-size:9px;cursor:pointer}
    #kit-cex .ki-live-tabs button.active{border-color:#25d6d0;color:#25d6d0}
    #kit-cex .ki-live-panel{padding:8px 10px;overflow:auto}
    #kit-cex .ki-summary{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;margin-bottom:7px;border:1px solid #1a2633;border-radius:7px;background:#0a1017}
    #kit-cex .ki-summary strong{font-size:15px}
    #kit-cex .ki-live-dot{color:#25d6d0;font-size:8px;white-space:nowrap}
    #kit-cex .ki-margin{margin:7px 0;border-top:1px solid #171d27;padding-top:8px}
    #kit-cex .ki-margin label{display:flex;justify-content:space-between;color:#718097;font-size:9px;margin-bottom:4px}
    #kit-cex .ki-margin input{width:100%;height:31px;background:#0c1118;color:#eef3f9;border:1px solid #202a38;border-radius:6px;padding:0 8px;box-sizing:border-box}
    #kit-cex .ki-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:5px}
    #kit-cex .ki-quick button{padding:4px;background:#111721;color:#9aa8bb;border:1px solid #263141;border-radius:4px;font-size:8px;cursor:pointer}
    #kit-cex .ki-note{font-size:8px;color:#657287;margin-top:4px}
    @media(max-width:700px){#kit-cex .ki-account{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  if(!document.getElementById('ki-cex-css')){const s=document.createElement('style');s.id='ki-cex-css';s.textContent=css;document.head.appendChild(s)}

  function account(){
    const a=live.balance.find(x=>String(x.currency||x.coin||'').toUpperCase()==='USDT')||live.balance[0]||{};
    const p=live.positions;
    const unreal=num(a.unrealized??a.unrealised??a.unrealizedPnl??a.unrealizedPL)+p.reduce((s,x)=>s+num(x.unrealised??x.unrealizedPnl??x.unrealizedPL),0);
    const margin=num(a.positionMargin??a.marginUsed)+p.reduce((s,x)=>s+num(x.im??x.margin??x.initialMargin),0);
    const wallet=num(a.cashBalance??a.balance??a.walletBalance??a.equity);
    const equity=num(a.equity??a.totalEquity??a.balance)+unreal;
    const available=num(a.availableBalance??a.availableCash??a.availableOpen??a.available??a.availableBalanceUsdt);
    return {wallet,available,margin,equity,unreal};
  }

  function renderAccount(){
    const box=document.querySelector('#kit-cex .kc-account'); if(!box)return;
    const a=account();
    box.innerHTML=`<div class="ki-account"><div class="ki-stat"><small>WALLET BALANCE</small><b>${fmt(a.wallet)} USDT</b></div><div class="ki-stat"><small>AVAILABLE MARGIN</small><b>${fmt(a.available)} USDT</b></div><div class="ki-stat"><small>POSITION MARGIN</small><b>${fmt(a.margin)} USDT</b></div><div class="ki-stat"><small>EQUITY</small><b>${fmt(a.equity)} USDT</b></div><div class="ki-stat"><small>UNREALIZED PNL</small><b>${a.unreal>=0?'+':''}${fmt(a.unreal)} USDT</b></div></div>`;
  }

  function contract(symbol){
    const s=String(symbol||document.querySelector('#kit-cex #ks')?.value||'BTCUSDT').toUpperCase().replace('_USDT','USDT');
    return live.pairs.find(p=>String(p.symbol||p.contractId||p.instId||'').toUpperCase().replace('_USDT','USDT')===s)||null;
  }

  function installMargin(){
    const order=document.querySelector('#kit-cex .kc-order');
    const size=document.querySelector('#kit-cex #size');
    if(!order||!size)return;
    let box=order.querySelector('.ki-margin');
    if(!box){
      box=document.createElement('div'); box.className='ki-margin';
      box.innerHTML='<label>Position margin <span class="ki-est">Live contract data</span></label><input class="ki-margin-input" inputmode="decimal" placeholder="USDT margin"><div class="ki-quick"><button data-q="25">25%</button><button data-q="50">50%</button><button data-q="75">75%</button><button data-q="100">Max</button></div><div class="ki-note">Sizing uses the live pair contract specification, live price and leverage.</div>';
      const anchor=size.closest('.kc-field'); anchor?.parentNode?.insertBefore(box,anchor);
      size.readOnly=true;
      box.querySelector('.ki-margin-input')?.addEventListener('input',calc);
      box.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>{const a=account();const i=box.querySelector('.ki-margin-input');if(i)i.value=(a.available*num(b.dataset.q)/100).toFixed(6);calc()}));
      document.querySelector('#kit-cex #lev')?.addEventListener('input',calc);
      document.querySelector('#kit-cex #price')?.addEventListener('input',calc);
    }
    calc();
    function calc(){
      const m=num(box.querySelector('.ki-margin-input')?.value),lev=num(document.querySelector('#kit-cex #lev')?.value),price=num(document.querySelector('#kit-cex #price')?.value)||num(live.ticker?.lastPrice||live.ticker?.last||live.ticker?.fairPrice),p=contract(),cs=num(p?.contractSize),unit=num(p?.volUnit),scale=p?.volScale;
      const est=box.querySelector('.ki-est');
      if(!m||!lev||!price||!cs){if(est)est.textContent=p?'Waiting for live price':'Live contract specs unavailable';return}
      let v=m*lev/(price*cs);if(unit>0)v=Math.floor(v/unit)*unit;if(Number.isFinite(Number(scale)))v=Number(v.toFixed(Number(scale)));size.value=v;if(est)est.textContent=`≈ ${fmt(v)} contracts`;
    }
  }

  function pnl(p,closed=false){
    if(closed)return num(p.closeProfitLoss??p.realised??p.realizedPnl??p.profit);
    const direct=p.unrealised??p.unrealizedPnl??p.unrealizedPL;if(direct!=null)return num(direct);
    const entry=num(p.holdAvgPrice??p.openAvgPrice??p.avgOpenPrice),mark=num(p.fairPrice??p.markPrice),vol=num(p.holdVol??p.total??p.size),cs=num(contract(p.symbol)?.contractSize),side=Number(p.positionType??p.posSide)===2?-1:1;
    return entry&&mark&&vol&&cs?(mark-entry)*vol*cs*side:0;
  }
  const margin=p=>num(p.im??p.margin??p.initialMargin);

  function lower(tab){
    let rows=[],total=0,title='';
    if(tab==='open'){rows=live.positions;total=rows.reduce((s,p)=>s+pnl(p),0);title='Open positions'}
    else if(tab==='close'){rows=live.closed;total=rows.reduce((s,p)=>s+pnl(p,true),0);title='Closed positions'}
    else {rows=live.history;total=rows.reduce((s,p)=>s+num(p.profit??p.realizedPnl??p.realised),0);title='Order history'}
    const body=rows.length?`<table class="kc-table"><thead><tr><th>Pair</th><th>Side</th><th>Entry</th><th>Exit / Mark</th><th>Margin</th><th>PNL</th><th>ROI</th></tr></thead><tbody>${rows.map(p=>{const x=pnl(p,tab==='close'),m=margin(p),roi=m?x/m*100:0,side=Number(p.positionType??p.posSide)===2?'Short':'Long';return `<tr><td>${esc(p.symbol||p.contractId||'—')}</td><td>${side}</td><td>${fmt(p.holdAvgPrice??p.openAvgPrice??p.avgOpenPrice??p.price)}</td><td>${fmt(p.closeAvgPrice??p.newCloseAvgPrice??p.fairPrice??p.markPrice??p.dealAvgPrice)}</td><td>${fmt(m)} USDT</td><td>${x>=0?'+':''}${fmt(x)} USDT</td><td>${roi>=0?'+':''}${fmt(roi)}%</td></tr>`}).join('')}</tbody></table>`:'<div class="kc-empty">No records yet</div>';
    return `<div class="ki-summary"><div><small style="color:#657287">LIVE ${title}</small><br><strong>${total>=0?'+':''}${fmt(total)} USDT</strong></div><span class="ki-live-dot">● LIVE DATA</span></div>${body}`;
  }

  function installTabs(){
    const root=document.getElementById('kit-cex');if(!root)return;
    let tabs=root.querySelector('.ki-live-tabs'),panel=root.querySelector('.ki-live-panel');
    if(!tabs){
      tabs=document.createElement('div');tabs.className='ki-live-tabs';tabs.innerHTML='<button data-ki="open">Open</button><button data-ki="close">Close</button><button data-ki="history">History</button>';
      panel=document.createElement('div');panel.className='ki-live-panel';root.append(tabs,panel);
      tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{tabs.dataset.tab=b.dataset.ki;tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));panel.innerHTML=lower(tabs.dataset.tab)}));
      tabs.dataset.tab='open';
    }
    tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.ki===tabs.dataset.tab));
    panel.innerHTML=lower(tabs.dataset.tab||'open');
  }

  function enhance(){scheduled=false;const root=document.getElementById('kit-cex');if(!root)return;renderAccount();installMargin();installTabs()}
  function queue(){if(scheduled)return;scheduled=true;queueMicrotask(enhance)}
  queue();
})();
