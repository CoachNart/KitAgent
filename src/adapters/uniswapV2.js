import { createAdapter } from '../engine/adapterRegistry.js';
import { createPlan } from '../engine/transactionPlan.js';
import { rpc } from '../chain/robinhood.js';
import { decodeFunctionResult, encodeFunctionData, parseEther } from 'viem';

const ROUTER = '0x89e5DB8B5aA49aA85AC63f691524311AEB649eba';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const routerAbi = [
  { type: 'function', name: 'WETH', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address[]' }], outputs: [{ type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactETHForTokens', stateMutability: 'payable', inputs: [{ type: 'uint256' }, { type: 'address[]' }, { type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactTokensForETH', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactTokensForTokens', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
];
const erc20Abi = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const read = async (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 900);
const bps = (value, basisPoints = 50n) => (BigInt(value) * (10000n - basisPoints)) / 10000n;

export const uniswapV2Adapter = createAdapter({
  id: 'uniswap-v2',
  name: 'Uniswap V2 swaps on Robinhood Chain',
  capabilities: ['swap', 'quote'],
  chains: [4663],
  quote: async ({ amountIn, path }) => {
    if (!path?.every(ADDRESS.test.bind(ADDRESS))) throw new Error('Swap path must contain valid token addresses.');
    const data = encodeFunctionData({ abi: routerAbi, functionName: 'getAmountsOut', args: [BigInt(amountIn), path] });
    const result = decodeFunctionResult({ abi: routerAbi, functionName: 'getAmountsOut', data: await read(ROUTER, data) });
    return result.map(String);
  },
  prepare: async ({ from, tokenIn, tokenOut, amountIn, slippageBps = 50, nativeIn = false, nativeOut = false }) => {
    if (!ADDRESS.test(from) || !ADDRESS.test(tokenOut) || (!nativeIn && !ADDRESS.test(tokenIn))) throw new Error('Wallet and token addresses are required.');
    const input = nativeIn ? parseEther(String(amountIn)) : BigInt(amountIn);
    const wethData = encodeFunctionData({ abi: routerAbi, functionName: 'WETH', args: [] });
    const weth = decodeFunctionResult({ abi: routerAbi, functionName: 'WETH', data: await read(ROUTER, wethData) });
    const path = nativeIn ? [weth, tokenOut] : nativeOut ? [tokenIn, weth] : [tokenIn, tokenOut];
    const quoted = await uniswapV2Adapter.quote({ amountIn: input, path });
    const amountOutMin = bps(quoted[quoted.length - 1], BigInt(slippageBps));
    const expiry = deadline();
    const transactions = [];
    if (!nativeIn) {
      const allowanceData = encodeFunctionData({ abi: erc20Abi, functionName: 'allowance', args: [from, ROUTER] });
      const allowance = BigInt(await read(tokenIn, allowanceData));
      if (allowance < input) {
        transactions.push({ to: tokenIn, data: `0x095ea7b3${ROUTER.slice(2).padStart(64,'0')}${input.toString(16).padStart(64,'0')}` });
      }
    }
    let data;
    let value = 0n;
    if (nativeIn) {
      data = encodeFunctionData({ abi: routerAbi, functionName: 'swapExactETHForTokens', args: [amountOutMin, path, from, expiry] });
      value = input;
    } else if (nativeOut) {
      data = encodeFunctionData({ abi: routerAbi, functionName: 'swapExactTokensForETH', args: [input, amountOutMin, path, from, expiry] });
    } else {
      data = encodeFunctionData({ abi: routerAbi, functionName: 'swapExactTokensForTokens', args: [input, amountOutMin, path, from, expiry] });
    }
    transactions.push({ to: ROUTER, data, value });
    return createPlan({
      adapter: 'uniswap-v2',
      title: 'Swap on Uniswap',
      from,
      transactions,
      expectedChanges: [`Swap ${String(amountIn)} input through Uniswap V2`, `Minimum output: ${amountOutMin.toString()} base units`],
      risk: ['Slippage is applied to the quoted output.', 'Review token contracts and the router before signing.', 'ERC-20 swaps may require an approval transaction first.'],
      metadata: { router: ROUTER, tokenIn: nativeIn ? 'ETH' : tokenIn, tokenOut, quotedOut: quoted.at(-1), amountOutMin: amountOutMin.toString(), slippageBps },
    });
  },
});

export const UNISWAP_V2_ROUTER = ROUTER;
