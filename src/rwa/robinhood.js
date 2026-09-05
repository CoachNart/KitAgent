const BASE='https://api.robinhood.com/rhj';
const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
async function get(path){const r=await fetch(`${BASE}${path}`,{headers:{accept:'application/json'}});if(!r.ok)throw new Error(`Robinhood RWA API ${r.status}`);return r.json()}
export async function stockTokens(){const data=await get('/assets');return (data.assets||data||[]).map(x=>({...x,deployments:(x.deployments||[]).filter(d=>Number(d.chainId)===4663&&ADDRESS.test(d.contractAddress))}))}
export async function stockToken(symbol){const s=encodeURIComponent(String(symbol||'').trim().toUpperCase());const data=await get(`/prices/${s}`);return data.quotes?.[0]||null}
export function stockTokenValue(quote,multiplier='1'){if(!quote?.bid&&!quote?.ask)return null;const mid=(Number(quote.bid)+Number(quote.ask))/2;return{currency:quote.currency||'USD',mid,displayMid:mid*Number(multiplier),bid:Number(quote.bid),ask:Number(quote.ask),generatedAt:quote.generatedAt||null}}
