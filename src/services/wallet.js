const ERC721_TRANSFER = '0x23b872dd';

export async function connectWallet() {
  if (!window.ethereum) throw new Error('No injected EVM wallet detected.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts[0] || null;
}

export function isWalletAvailable() { return typeof window !== 'undefined' && Boolean(window.ethereum); }

export async function prepareNativeTransfer({ from, to, valueHex }) {
  if (!from || !to || !valueHex) throw new Error('Recipient and amount are required.');
  return { from, to, value: valueHex, type: 'native-transfer', requiresWalletApproval: true };
}

export async function prepareErc721Transfer({ from, contract, tokenId, recipient }) {
  if (!from || !contract || tokenId === undefined || !recipient) throw new Error('NFT contract, token ID and recipient are required.');
  return { from, to: contract, data: `${ERC721_TRANSFER}${from.slice(2).padStart(64, '0')}${recipient.slice(2).padStart(64, '0')}${BigInt(tokenId).toString(16).padStart(64, '0')}`, type: 'erc721-transfer', requiresWalletApproval: true };
}

export async function requestWalletApproval(tx) {
  if (!window.ethereum) throw new Error('Connect an EVM wallet first.');
  if (!tx?.from || !tx?.to) throw new Error('No prepared transaction found.');
  return window.ethereum.request({ method: 'eth_sendTransaction', params: [tx] });
}
