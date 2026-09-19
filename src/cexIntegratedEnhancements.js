(()=>{
  // Integrated CEX enhancement layer. It augments the existing terminal DOM after each native terminal render.
  const live={balance:[],positions:[],history:[],closed:[],pairs:[],ticker:null};
  let scheduled=false;
  const arr=v=>Array.isArray(v)?v:(Array.isArray(v?.data)?v.data:[]);
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{maximumFractionDigits:6}):'—';
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const normSym=s=>String(s||'BTCUSDT').toUpperCase().replace(/[-/]/g,'').replace('_USDT','USDT');

  const nativeInnerHTML=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(nativeInnerHTML?.set){
    Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,enumerable:nativeInnerHTML.enumerable,get:nativeInnerHTML.get,set(value){nativeInnerHTML.set.call(this,value);if(this.id==='kit-cex')queue()}});
  }

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    const response=await nativeFetch(...args);
    try{
      const init=args[1],body=typeof init?.body==='string'?JSON.parse(init.body):null;
      if(body?.action){
        const clone=response.clone();clone.json().then(data=>{
          if(body.action==='balance')live.balance=arr(data);
          else if(body.action==='positions')live.positions=arr(data);
          else if(body.action==='history')live.history=arr(data);
          else if(body.action==='positionHistory')live.closed=arr(data);
          else if(body.action==='pairs')live.pairs=arr(data);
          else if(body.action==='ticker')live.ticker=data;
          queue();
        }).catch(()=>{});
      }
    }catch{}
    return response;
  };

  const css=`
    #kit-cex .ki-account{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;margin-top:10px;border-top:1px solid #171d27;background:#171d27}
    #kit-cex .ki-stat{background:#090d13;padding:8px 9px;min-width:0}.ki-stat small{display:block;color:#657287;font-size:8px;margin-bottom:3px}.ki-stat b{font-size:11px;white-space:nowrap}
    #kit-cex .ki-live-tabs{display:flex;gap:4px;padding:8px 10px 0}#kit-cex .ki-live-tabs button,#kit-cex .ki-sharebar button{background:#111721;color:#aab6c7;border:1px solid #263141;border-radius:5px;padding:5px 9px;font-size:9px;cursor:pointer}#kit-cex .ki-live-tabs button.active{border-color:#25d6d0;color:#25d6d0}
    #kit-cex .ki-live-panel{padding:8px 10px;overflow:auto}.ki-summary{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;margin-bottom:7px;border:1px solid #1a2633;border-radius:7px;background:#0a1017}.ki-summary strong{font-size:15px}.ki-live-dot{color:#25d6d0;font-size:8px;white-space:nowrap}
    #kit-cex .ki-margin{margin:7px 0;border-top:1px solid #171d27;padding-top:8px}#kit-cex .ki-margin label{display:flex;justify-content:space-between;color:#718097;font-size:9px;margin-bottom:4px}#kit-cex .ki-margin input{width:100%;height:31px;background:#0c1118;color:#eef3f9;border:1px solid #202a38;border-radius:6px;padding:0 8px;box-sizing:border-box}.ki-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:5px}.ki-quick button{padding:4px;background:#111721;color:#9aa8bb;border:1px solid #263141;border-radius:4px;font-size:8px;cursor:pointer}.ki-note{font-size:8px;color:#657287;margin-top:4px}
    #kit-cex .ki-sharebar{display:flex;gap:5px;margin:7px 0}.ki-sharebar button:first-child{border-color:#25d6d0;color:#25d6d0}.ki-sharebar button{flex:1}.ki-brand-note{font-size:8px;color:#657287;margin-top:5px}.ki-pair-open{display:block!important}.kc-pairmenu{pointer-events:auto}
    @media(max-width:700px){#kit-cex .ki-account{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  if(!document.getElementById('ki-cex-css')){const s=document.createElement('style');s.id='ki-cex-css';s.textContent=css;document.head.appendChild(s)}

  function account(){
    const a=live.balance.find(x=>String(x.currency||x.coin||'').toUpperCase()==='USDT')||live.balance[0]||{};
    const p=live.positions;
    const unreal=num(a.unrealized??a.unrealised??a.unrealizedPnl??a.unrealizedPL)+p.reduce((s,x)=>s+pnl(x),0);
    const margin=num(a.positionMargin??a.marginUsed)+p.reduce((s,x)=>s+num(x.im??x.margin??x.initialMargin),0);
    const wallet=num(a.cashBalance??a.balance??a.walletBalance??a.equity);
    const equity=num(a.equity??a.totalEquity??a.balance)+unreal;
    const available=num(a.availableBalance??a.availableCash??a.availableOpen??a.available??a.availableBalanceUsdt);
    return {wallet,available,margin,equity,unreal};
  }
  function renderAccount(){const box=document.querySelector('#kit-cex .kc-account');if(!box)return;const a=account();box.innerHTML=`<div class="ki-account"><div class="ki-stat"><small>WALLET BALANCE</small><b>${fmt(a.wallet)} USDT</b></div><div class="ki-stat"><small>AVAILABLE MARGIN</small><b>${fmt(a.available)} USDT</b></div><div class="ki-stat"><small>POSITION MARGIN</small><b>${fmt(a.margin)} USDT</b></div><div class="ki-stat"><small>EQUITY</small><b>${fmt(a.equity)} USDT</b></div><div class="ki-stat"><small>UNREALIZED PNL</small><b>${a.unreal>=0?'+':''}${fmt(a.unreal)} USDT</b></div></div>`}

  function contract(symbol){const s=normSym(symbol||document.querySelector('#kit-cex #ks')?.value||'BTCUSDT');return live.pairs.find(p=>normSym(p.symbol||p.contractId||p.instId||p.name)===s)||null}
  function maxLeverage(){const p=contract();return Math.max(1,Math.floor(num(p?.maxLeverage)||100))}
  function installLeverage(){const input=document.querySelector('#kit-cex #lev');if(!input)return;const max=maxLeverage();input.max=String(max);input.step='1';if(num(input.value)>max)input.value=String(max);const label=input.closest('.kc-field')?.querySelector('label');if(label){const span=label.querySelector('span');if(span)span.innerHTML=`${num(input.value)}x <small style="color:#657287">max ${max}x</small>`;else label.innerHTML=`<span>Leverage</span><span>${num(input.value)}x <small style="color:#657287">max ${max}x</small></span>`}input.title=`Live MEXC maximum for ${normSym(document.querySelector('#kit-cex #ks')?.value||'BTCUSDT')}: ${max}x`}

  function installPairFix(){
    const root=document.getElementById('kit-cex');if(!root||root.dataset.kiPairFix)return;root.dataset.kiPairFix='1';
    const menu=()=>root.querySelector('#pairmenu');
    const search=()=>root.querySelector('#pairsearch');
    const symbolInput=()=>root.querySelector('#ks');
    const filter=(term='')=>{const q=String(term).trim().toUpperCase();root.querySelectorAll('.kc-pairitem').forEach(item=>{item.style.display=!q||item.textContent.toUpperCase().includes(q)?'flex':'none'})};
    root.addEventListener('focusin',e=>{if(e.target.id==='ks'){menu()?.classList.add('open');filter(e.target.value)}} ,true);
    root.addEventListener('click',e=>{
      const item=e.target.closest('.kc-pairitem');
      if(item&&root.contains(item)){
        e.preventDefault();e.stopPropagation();const input=symbolInput();if(input){input.value=item.dataset.pair||item.textContent.trim().split(/\s+/)[0];root.dataset.kiPairSelecting='1';input.dispatchEvent(new Event('input',{bubbles:true}));delete root.dataset.kiPairSelecting}menu()?.classList.remove('open');return;
      }
      if(e.target.id==='ks'||e.target.closest('#ks'))menu()?.classList.add('open');
      else if(!e.target.closest('.kc-pair'))menu()?.classList.remove('open');
    },true);
    root.addEventListener('input',e=>{
      if(e.target.id==='pairsearch'){e.stopPropagation();filter(e.target.value);return}
      if(e.target.id==='ks'&&!root.dataset.kiPairSelecting){e.stopPropagation();filter(e.target.value);menu()?.classList.add('open')}
    },true);
  }

  function installMargin(){
    const order=document.querySelector('#kit-cex .kc-order'),size=document.querySelector('#kit-cex #size');if(!order||!size)return;let box=order.querySelector('.ki-margin');
    if(!box){box=document.createElement('div');box.className='ki-margin';box.innerHTML='<label>Position margin <span class="ki-est">Live contract data</span></label><input class="ki-margin-input" inputmode="decimal" placeholder="USDT margin"><div class="ki-quick"><button data-q="25">25%</button><button data-q="50">50%</button><button data-q="75">75%</button><button data-q="100">Max</button></div><div class="ki-note">Sizing uses the live pair contract specification, live price and leverage.</div>';const anchor=size.closest('.kc-field');anchor?.parentNode?.insertBefore(box,anchor);size.readOnly=true;box.querySelector('.ki-margin-input')?.addEventListener('input',calc);box.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>{const a=account(),i=box.querySelector('.ki-margin-input');if(i)i.value=(a.available*num(b.dataset.q)/100).toFixed(6);calc()}));document.querySelector('#kit-cex #lev')?.addEventListener('input',calc);document.querySelector('#kit-cex #price')?.addEventListener('input',calc)}
    calc();function calc(){const m=num(box.querySelector('.ki-margin-input')?.value),lev=num(document.querySelector('#kit-cex #lev')?.value),price=num(document.querySelector('#kit-cex #price')?.value)||num(live.ticker?.lastPrice||live.ticker?.last||live.ticker?.fairPrice),p=contract(),cs=num(p?.contractSize),unit=num(p?.volUnit),scale=p?.volScale;const est=box.querySelector('.ki-est');if(!m||!lev||!price||!cs){if(est)est.textContent=p?'Waiting for live price':'Live contract specs unavailable';return}let v=m*lev/(price*cs);if(unit>0)v=Math.floor(v/unit)*unit;if(Number.isFinite(Number(scale)))v=Number(v.toFixed(Number(scale)));size.value=v;if(est)est.textContent=`≈ ${fmt(v)} contracts`}}

  function pnl(p,closed=false){if(closed)return num(p.closeProfitLoss??p.realised??p.realizedPnl??p.profit);const direct=p.unrealised??p.unrealizedPnl??p.unrealizedPL;if(direct!=null)return num(direct);const entry=num(p.holdAvgPrice??p.openAvgPrice??p.avgOpenPrice),mark=num(p.fairPrice??p.markPrice),vol=num(p.holdVol??p.total??p.size),cs=num(contract(p.symbol)?.contractSize),side=Number(p.positionType??p.posSide)===2?-1:1;return entry&&mark&&vol&&cs?(mark-entry)*vol*cs*side:0}
  const margin=p=>num(p.im??p.margin??p.initialMargin);

  function imageData(p,closed,forcedPnl){
    const symbol=normSym(p?.symbol||document.querySelector('#kit-cex #ks')?.value||'BTCUSDT');const x=forcedPnl??pnl(p,closed);const m=margin(p);const roi=m?x/m*100:0;const entry=num(p?.holdAvgPrice??p?.openAvgPrice??p?.avgOpenPrice??p?.price);const exit=num(p?.closeAvgPrice??p?.newCloseAvgPrice??p?.fairPrice??p?.markPrice??p?.dealAvgPrice);const lev=num(p?.leverage)||num(document.querySelector('#kit-cex #lev')?.value);return {symbol,x,m,roi,entry,exit,lev,side:Number(p?.positionType??p?.posSide)===2?'SHORT':'LONG'}
  }
  async function makePnlImage(p,closed,forcedPnl,ad=false){
    const d=imageData(p,closed,forcedPnl),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;const c=canvas.getContext('2d');
    const g=c.createLinearGradient(0,0,1200,675);g.addColorStop(0,'#070a0f');g.addColorStop(1,'#101923');c.fillStyle=g;c.fillRect(0,0,1200,675);c.strokeStyle='#25d6d0';c.lineWidth=2;c.strokeRect(36,36,1128,603);
    c.fillStyle='#25d6d0';c.font='800 30px Inter,Arial,sans-serif';c.fillText('KitSetups',72,92);c.fillStyle='#657287';c.font='500 16px Inter,Arial,sans-serif';c.fillText(ad?'TRADING RESULT':'FUTURES PNL',72,122);
    c.fillStyle='#e7edf7';c.font='800 64px Inter,Arial,sans-serif';c.fillText(`${d.x>=0?'+':''}${fmt(d.x)} USDT`,72,215);c.fillStyle=d.x>=0?'#25d6d0':'#ff6878';c.font='700 25px Inter,Arial,sans-serif';c.fillText(`${d.roi>=0?'+':''}${fmt(d.roi)}% ROI`,74,258);
    const cells=[['PAIR',d.symbol],['SIDE',d.side],['LEVERAGE',`${d.lev}x`],['MARGIN',`${fmt(d.m)} USDT`],['ENTRY',fmt(d.entry)],['EXIT / MARK',fmt(d.exit)]];cells.forEach((v,i)=>{const col=i%3,row=Math.floor(i/3),x=72+col*350,y=330+row*115;c.fillStyle='#657287';c.font='600 13px Inter,Arial,sans-serif';c.fillText(v[0],x,y);c.fillStyle='#eef3f9';c.font='700 24px Inter,Arial,sans-serif';c.fillText(v[1],x,y+34)});
    c.fillStyle='#657287';c.font='500 13px Inter,Arial,sans-serif';c.fillText(`Generated ${new Date().toLocaleString()}  •  kitsetups.xyz`,72,604);
    return await new Promise(resolve=>canvas.toBlob(b=>resolve({blob:b,canvas}), 'image/png',1));
  }
  async function sharePnl(p,closed,forcedPnl){const out=await makePnlImage(p,closed,forcedPnl,false);if(!out?.blob)return;const file=new File([out.blob],`kitsetups-${normSym(p?.symbol)}-pnl.png`,{type:'image/png'});try{if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:'KitSetups PNL',text:`${normSym(p?.symbol)} • ${forcedPnl??pnl(p,closed)>=0?'+':''}${fmt(forcedPnl??pnl(p,closed))} USDT`,files:[file]});return}}catch(error){if(error?.name==='AbortError')return}downloadBlob(out.blob,`kitsetups-${normSym(p?.symbol)}-pnl.png`)}
  async function downloadAd(p,closed,forcedPnl){const out=await makePnlImage(p,closed,forcedPnl,true);if(out?.blob)downloadBlob(out.blob,`kitsetups-${normSym(p?.symbol)}-ad.png`)}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

  function lower(tab){let rows=[],total=0,title='';if(tab==='open'){rows=live.positions;total=rows.reduce((s,p)=>s+pnl(p),0);title='Open positions'}else if(tab==='close'){rows=live.closed;total=rows.reduce((s,p)=>s+pnl(p,true),0);title='Closed positions'}else{rows=live.history;total=rows.reduce((s,p)=>s+num(p.profit??p.realizedPnl??p.realised),0);title='Order history'}const body=rows.length?`<table class="kc-table"><thead><tr><th>Pair</th><th>Side</th><th>Entry</th><th>Exit / Mark</th><th>Margin</th><th>PNL</th><th>ROI</th><th>Share</th></tr></thead><tbody>${rows.map((p,i)=>{const x=pnl(p,tab==='close'),m=margin(p),roi=m?x/m*100:0,side=Number(p.positionType??p.posSide)===2?'Short':'Long';return `<tr><td>${esc(p.symbol||p.contractId||'—')}</td><td>${side}</td><td>${fmt(p.holdAvgPrice??p.openAvgPrice??p.avgOpenPrice??p.price)}</td><td>${fmt(p.closeAvgPrice??p.newCloseAvgPrice??p.fairPrice??p.markPrice??p.dealAvgPrice)}</td><td>${fmt(m)} USDT</td><td>${x>=0?'+':''}${fmt(x)} USDT</td><td>${roi>=0?'+':''}${fmt(roi)}%</td><td><button class="kc-action ki-pnl-share" data-i="${i}" data-tab="${tab}">Share</button></td></tr>`}).join('')}</tbody></table>`:'<div class="kc-empty">No records yet</div>';return `<div class="ki-summary"><div><small style="color:#657287">LIVE ${title}</small><br><strong>${total>=0?'+':''}${fmt(total)} USDT</strong></div><span class="ki-live-dot">● LIVE DATA</span></div><div class="ki-sharebar"><button data-share-summary="1">Share PNL image</button><button data-download-summary="1">Download Ad image</button></div>${body}`}

  function installTabs(){const root=document.getElementById('kit-cex');if(!root)return;let tabs=root.querySelector('.ki-live-tabs'),panel=root.querySelector('.ki-live-panel');if(!tabs){tabs=document.createElement('div');tabs.className='ki-live-tabs';tabs.innerHTML='<button data-ki="open">Open</button><button data-ki="close">Close</button><button data-ki="history">History</button>';panel=document.createElement('div');panel.className='ki-live-panel';root.append(tabs,panel);tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{tabs.dataset.tab=b.dataset.ki;tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));panel.innerHTML=lower(tabs.dataset.tab)}));tabs.dataset.tab='open'}tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.ki===tabs.dataset.tab));panel.innerHTML=lower(tabs.dataset.tab||'open');
    panel.querySelector('[data-share-summary]')?.addEventListener('click',()=>{const rows=(tabs.dataset.tab==='open'?live.positions:tabs.dataset.tab==='close'?live.closed:live.history);const p=rows[0]||{};sharePnl(p,tabs.dataset.tab==='close')});
    panel.querySelector('[data-download-summary]')?.addEventListener('click',()=>{const rows=(tabs.dataset.tab==='open'?live.positions:tabs.dataset.tab==='close'?live.closed:live.history);const p=rows[0]||{};downloadAd(p,tabs.dataset.tab==='close')});
    panel.querySelectorAll('.ki-pnl-share').forEach(btn=>btn.addEventListener('click',()=>{const rows=btn.dataset.tab==='open'?live.positions:btn.dataset.tab==='close'?live.closed:live.history;const p=rows[Number(btn.dataset.i)]||{};const closed=btn.dataset.tab==='close';sharePnl(p,closed)}));
  }

  function enhance(){scheduled=false;const root=document.getElementById('kit-cex');if(!root)return;renderAccount();installLeverage();installPairFix();installMargin();installTabs()}
  function queue(){if(scheduled)return;scheduled=true;queueMicrotask(enhance)}
  queue();
})();
