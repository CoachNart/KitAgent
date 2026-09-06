export const ROBINHOOD_CHAIN = {
  name: 'Robinhood Chain',
  chainId: 4663,
  hex: '0x1237',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robinhoodchain.blockscout.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

export const rpc = async (method, params = []) => {
  const response = await fetch(ROBINHOOD_CHAIN.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`RPC request failed (${response.status}).`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'RPC request failed.');
  return payload.result;
};

export const getNativeBalance = async (address) => {
  if (!address) return 0n;
  return BigInt(await rpc('eth_getBalance', [address, 'latest']));
};

export const getBlockNumber = async () => BigInt(await rpc('eth_blockNumber'));
