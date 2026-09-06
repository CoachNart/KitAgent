// KitAgent terminal-first orchestration helpers.
const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
const NFT_RE=/\b(?:nft|token)\s*(?:#|id\s*)?(\d+)\b/i;
const CONTRACT_RE=/\b(?:contract|collection)\s+(0x[a-fA-F0-9]{40})\b/i;

export function classifyTerminalCommand(text=''){
  const t=text.trim();
  const l=t.toLowerCase();
  if(/\b(send|transfer)\b/.test(l)&&/\bnft\b/.test(l)) return 'nft-send';
  if(/\b(swap|exchange|trade)\b/.test(l)) return 'swap';
  if(/\b(bridge)\b/.test(l)) return 'bridge';
  if(/\b(approve|allowance)\b/.test(l)) return 'approve';
  if(/\b(supply|deposit|borrow|repay|withdraw|stake)\b/.test(l)) return 'defi';
  if(/\b(send|transfer)\b/.test(l)) return 'send';
  if(/\b(portfolio|balance|holdings)\b/.test(l)) return 'portfolio';
  if(/\b(gas|fee)\b/.test(l)) return 'gas';
  if(/\bfaucet|test\s*eth\b/.test(l)) return 'faucet';
  return 'unknown';
}

export function parseTerminalNft(text=''){
  const address=text.match(ADDRESS)?.[0]||null;
  const contract=text.match(CONTRACT_RE)?.[1]||null;
  const tokenId=text.match(NFT_RE)?.[1]||null;
  return {address,contract,tokenId};
}

export function looksLikeAddress(text=''){return ADDRESS.test(text.trim())}
