export const MULTICALL3_BY_CHAIN = {};
export function normalizeCall(call,account){if(!/^0x[a-fA-F0-9]{40}$/.test(call.to))throw new Error('Invalid batch target');if(call.data&&!/^0x[0-9a-fA-F]*$/.test(call.data))throw new Error('Invalid batch calldata');return{from:account,to:call.to,data:call.data||'0x',value:call.value||'0x0'}}
export function validateBatch(calls,account){if(!Array.isArray(calls)||calls.length<2)throw new Error('Batch needs at least two calls');if(calls.length>20)throw new Error('Batch is limited to 20 calls');return calls.map(c=>normalizeCall(c,account))}
export function riskBatch(calls){return calls.map((c,i)=>({index:i,target:c.to,hasValue:BigInt(c.value||'0')>0n,calldataBytes:Math.max(0,((c.data||'0x').length-2)/2)}))}
