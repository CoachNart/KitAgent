const envAddress=name=>import.meta.env[name]||'';
export const PROTOCOLS={
  uniswap:{name:'Uniswap',router:envAddress('VITE_UNISWAP_ROUTER'),status:envAddress('VITE_UNISWAP_ROUTER')?'configured':'configuration required'},
  morpho:{name:'Morpho',router:envAddress('VITE_MORPHO_ROUTER'),status:envAddress('VITE_MORPHO_ROUTER')?'configured':'configuration required'},
  layerzero:{name:'LayerZero',router:envAddress('VITE_LAYERZERO_ROUTER'),status:envAddress('VITE_LAYERZERO_ROUTER')?'configured':'configuration required'}
};
export function protocolTarget(name){const p=PROTOCOLS[String(name||'').toLowerCase()];if(!p?.router||!/^0x[a-fA-F0-9]{40}$/.test(p.router))throw new Error(`${p?.name||name} adapter is not configured with a verified contract address`);return p.router}
export function adapterStatus(){return Object.values(PROTOCOLS).map(p=>({name:p.name,status:p.status,target:p.router||null}))}
