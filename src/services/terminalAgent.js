import { getFaucets } from '../data/faucets';

const rules = [
  [/faucet|testnet/i, 'faucet'],
  [/nft/i, 'nft'],
  [/swap|exchange/i, 'swap'],
  [/bridge/i, 'bridge'],
  [/send|transfer/i, 'transfer'],
  [/buy|sell/i, 'trade'],
];

export function detectIntent(input) {
  return rules.find(([pattern]) => pattern.test(input))?.[1] || 'general';
}

export function respondToIntent(input) {
  const intent = detectIntent(input);
  const base = 'I will prepare the action first, show the route, fees and risk, then wait for your explicit terminal confirmation and wallet approval. Nothing is silently signed or broadcast.';
  if (intent === 'faucet') return { intent, text: 'Tell me the testnet you need. I can route you to verified faucet sources only.' };
  if (intent === 'nft') return { intent, text: 'NFT transfer: recipient → network → collection/token ID → gas preview → confirmation → wallet approval.' };
  if (intent === 'swap') return { intent, text: `Swap flow ready. ${base} I still need the input asset, output asset and amount before a real quote can be requested.` };
  if (intent === 'bridge') return { intent, text: `Bridge flow ready. ${base} I still need source chain, destination chain, asset and amount before routing.` };
  if (intent === 'transfer') return { intent, text: `Transfer flow ready. ${base} I still need recipient, asset, amount and network.` };
  if (intent === 'trade') return { intent, text: 'Trading flow ready. I will only surface a setup when liquidity, structure, delivery and risk/reward gates align.' };
  return { intent, text: `I can help plan Web3 actions in plain English. ${base}` };
}

export function faucetLinks(network) {
  return getFaucets(network);
}
