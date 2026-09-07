const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const CHAIN_ID = 4663;

async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  const json = await response.json();

  if (json.error) {
    throw new Error(json.error.message || 'RPC request failed');
  }

  return json.result;
}

export async function getBalance(address) {
  return rpc('eth_getBalance', [address, 'latest']);
}

export async function getTransactionReceipt(hash) {
  return rpc('eth_getTransactionReceipt', [hash]);
}

export async function getTransactionCount(address) {
  return rpc('eth_getTransactionCount', [address, 'latest']);
}

export async function estimateGas(tx) {
  return rpc('eth_estimateGas', [tx]);
}

export async function call(tx) {
  return rpc('eth_call', [tx, 'latest']);
}

export async function getGasPrice() {
  return rpc('eth_gasPrice');
}

export async function getChainId() {
  return rpc('eth_chainId');
}

export { RPC_URL, CHAIN_ID };
