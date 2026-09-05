export const MULTICALL3_ADDRESS='0xcA11bde05977b3631167028862bE2a173976CA11';
export const MULTICALL3_BY_CHAIN=Object.freeze({4663:MULTICALL3_ADDRESS});
const ADDRESS=/^0x[a-fA-F0-9]{40}$/;const HEX=/^0x[0-9a-fA-F]*$/;
export function setMulticall(chainId,address){if(!ADDRESS.test(address))throw new Error('Invalid Multicall3 address');return{chainId:Number(chainId),address}}
export function normalizeCall(call,account){if(!ADDRESS.test(call?.to||''))throw new Error('Invalid batch target');if(call.data&&!HEX.test(call.data))throw new Error('Invalid batch calldata');if(call.value&&(!HEX.test(call.value)||BigInt(call.value)<0n))throw new Error('Invalid batch value');return{from:account,to:call.to,data:call.data||'0x',value:call.value||'0x0'}}
export function validateBatch(calls,account){if(!Array.isArray(calls)||calls.length<2)throw new Error('Batch needs at least two calls');if(calls.length>20)throw new Error('Batch is limited to 20 calls');return calls.map(c=>normalizeCall(c,account))}
export function riskBatch(calls){return calls.map((c,i)=>({index:i,target:c.to,hasValue:BigInt(c.value||'0')>0n,calldataBytes:Math.max(0,((c.data||'0x').length-2)/2)}))}
export function batchSummary(calls){return{count:calls.length,totalValue:calls.reduce((n,c)=>n+BigInt(c.value||'0'),0n),targets:[...new Set(calls.map(c=>c.to.toLowerCase()))]}}
export function atomicBatchStatus(chainId){return MULTICALL3_BY_CHAIN[chainId]?{enabled:true,address:MULTICALL3_BY_CHAIN[chainId],method:'aggregate3'}:{enabled:false,address:null,reason:'No verified Multicall3 deployment configured for this chain'}}
export function encodeAggregate3(calls){if(!Array.isArray(calls)||!calls.length)throw new Error('No calls to encode');throw new Error('ABI encoder required: use the wallet/ABI layer before execution; raw hand-built batch calldata is intentionally blocked')}
