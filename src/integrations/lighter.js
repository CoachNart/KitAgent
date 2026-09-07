const API='https://api.rh.lighter.xyz';
export const LIGHTER_CONTRACT='0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d';
export const LIGHTER_UI='https://robinhoodchain.lighter.xyz';

async function request(path){
  const response=await fetch(`${API}${path}`,{headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error(`Lighter API returned ${response.status}`);
  return response.json();
}

export async function lighter(path='/') { return request(path); }

export async function status(){
  try { return await request('/'); }
  catch(error){ return {ok:false,error:error.message,api:API}; }
}

export const lighterInfo={chainId:4663,apiBase:API,contract:LIGHTER_CONTRACT,ui:LIGHTER_UI,docs:'https://apidocs.rh.lighter.xyz/docs/get-started'};
