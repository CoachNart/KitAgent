import { getFaucets } from '../data/faucets';

const rules = [
  [/faucet|testnet/i, 'faucet'],
  [/nft.*(sell|list|offer)|list.*nft|sell.*nft/i, 'nft_sell'],
  [/nft.*(buy|purchase)|buy.*nft/i, 'nft_buy'],
  [/nft.*(send|transfer)|send.*nft|transfer.*nft/i, 'nft_transfer'],
  [/nft|opensea|collection/i, 'nft'],
  [/swap|exchange/i, 'swap'],
  [/bridge/i, 'bridge'],
  [/lend|loan|borrow/i, 'lending'],
  [/liquidity|lp|pool/i, 'liquidity'],
  [/stake|unstake/i, 'staking'],
  [/yield|apy|apr/i, 'yield'],
  [/approve|allowance/i, 'approve'],
  [/batch|multiple transaction/i, 'batch'],
  [/contract|smart contract/i, 'contract'],
  [/send|transfer/i, 'transfer'],
  [/buy|sell|long|short|trade/i, 'trade'],
  [/airdrop|claim/i, 'airdrop'],
  [/governance|vote|dao/i, 'governance'],
  [/gas|fee/i, 'gas'],
  [/portfolio|balance|holdings/i, 'portfolio'],
];

export function detectIntent(input) {
  return rules.find(([pattern]) => pattern.test(input))?.[1] || 'general';
}

const base = 'I prepare the action, show the route, fees, approvals and risk, then wait for your explicit terminal confirmation and wallet approval. Nothing is silently signed or broadcast.';

export function respondToIntent(input) {
  const intent = detectIntent(input);
  const copy = {
    faucet: 'Tell me the testnet and asset you need. I will use verified faucet sources only.',
    nft_sell: 'NFT sale flow: identify the NFT → choose marketplace → set price/currency → review marketplace fees and approvals → confirm → wallet approval.',
    nft_buy: 'NFT purchase flow: identify collection/token → verify seller and asset → review price, royalties/fees and gas → confirm → wallet approval.',
    nft_transfer: 'NFT transfer flow: recipient → network → collection/token ID → ownership/approval check → gas preview → confirmation → wallet approval.',
    nft: 'NFT mode is ready for discovery, ownership checks, transfers, listings, offers, purchases and marketplace actions where an adapter supports the requested operation.',
    swap: `Swap flow ready. ${base} I need input asset, output asset, amount and network.`,
    bridge: `Bridge flow ready. ${base} I need source chain, destination chain, asset and amount.`,
    lending: `Lending flow ready. I can prepare supply, withdraw, borrow and repay actions for supported protocols after checking the requested market.`,
    liquidity: `Liquidity flow ready. I can prepare add/remove LP actions and surface pool/price-impact information where a supported adapter exists.`,
    staking: `Staking flow ready. I can prepare stake/unstake actions for supported protocols and show lock/unbonding terms when available.`,
    yield: `Yield mode ready. I can compare supported opportunities and risks; APY is variable and never guaranteed.`,
    approve: `Approval flow ready. I will show the token, spender, allowance and proposed approval before wallet authorization.`,
    batch: `Batch mode ready. I will decompose the requested actions and present the complete transaction set before authorization.`,
    contract: `Contract mode ready. I will require a known contract target and decoded call parameters before preparing a transaction.`,
    transfer: `Transfer flow ready. ${base} I need recipient, asset, amount and network.`,
    trade: 'Trading flow ready. Setups must pass liquidity, structure, delivery, volatility and risk/reward gates; otherwise the correct answer is no trade.',
    airdrop: 'Airdrop mode can inspect a supported claim flow, but I will never invent eligibility or claim contracts.',
    governance: 'Governance mode can help inspect proposals and prepare supported votes for wallet approval.',
    gas: 'Gas mode can estimate fees for supported networks and explain the asset required to pay them.',
    portfolio: 'Portfolio mode can summarize supported wallet assets, positions and recent activity when wallet data is available.',
    general: `I can route requests across crypto, DeFi, NFTs, trading, wallets and on-chain actions in plain English. ${base}`,
  };
  return { intent, text: copy[intent] };
}

export function faucetLinks(network) { return getFaucets(network); }
