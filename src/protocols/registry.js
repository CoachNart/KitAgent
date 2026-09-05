const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
const registry=new Map();
export function registerProtocol({name,chainIds=[],contracts=[],capabilities=[]}={}){if(!name)throw new Error('Protocol name required');for(const id of chainIds){const key=`${id}:${name.toLowerCase()}`;registry.set(key,{name,chainId:Number(id),contracts:contracts.filter(x=>ADDRESS.test(x)),capabilities:[...capabilities]})}return true}
export function protocol(name,chainId){return registry.get(`${Number(chainId)}:${String(name).toLowerCase()}`)||null}
export function verifiedTarget(name,chainId){const p=protocol(name,chainId);return p?.contracts?.[0]||null}
export function listProtocols(chainId){return [...registry.values()].filter(p=>chainId===undefined||p.chainId===Number(chainId))}
export function requireVerifiedTarget(name,chainId,target){if(!ADDRESS.test(target))throw new Error('Protocol target must be a valid address');const p=protocol(name,chainId);if(!p)throw new Error(`Protocol ${name} is not registered for chain ${chainId}`);if(!p.contracts.map(x=>x.toLowerCase()).includes(target.toLowerCase()))throw new Error(`Target is not a verified ${name} contract on chain ${chainId}`);return true}
