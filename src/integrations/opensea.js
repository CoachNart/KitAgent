export async function openSeaRequest(payload){const r=await fetch('/api/opensea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'OpenSea request failed');return d}
export async function getOwnedNFTs(address,chain='ethereum'){return openSeaRequest({action:'account-nfts',address,chain,limit:50})}
export async function getNFT(contract,tokenId,chain='ethereum'){return openSeaRequest({action:'nft',contract,tokenId,chain})}
export async function getListingActions(payload){return openSeaRequest({action:'listing-actions',payload})}
