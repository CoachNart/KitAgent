const OPENSEA_API = 'https://api.opensea.io/api/v2';

export async function buildNftIntent({ action, chain, collection, tokenId, recipient, price }) {
  return {
    kind: 'nft',
    action,
    chain,
    collection,
    tokenId,
    recipient,
    price,
    status: 'needs_adapter',
    message: 'NFT action prepared for adapter routing. Marketplace listing, offer and sale execution require a supported marketplace adapter and wallet approval.',
    requiresWalletApproval: true,
  };
}

export async function discoverNftCollection(slug) {
  if (!slug) throw new Error('Collection slug is required.');
  const response = await fetch(`${OPENSEA_API}/collections/${encodeURIComponent(slug)}`);
  if (!response.ok) throw new Error(`NFT marketplace returned ${response.status}.`);
  return response.json();
}
