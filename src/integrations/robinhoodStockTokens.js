const BASE='https://api.robinhood.com/rhj';

async function get(path){
  const response=await fetch(`${BASE}${path}`,{headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error(`Robinhood Stock Token API returned ${response.status}`);
  return response.json();
}

export async function stockTokenAssets(){return get('/assets');}
export async function stockTokenPrices(symbol){return get(`/prices/${encodeURIComponent(symbol.toUpperCase())}`);}
export async function corporateActions(){return get('/corporate-actions');}
