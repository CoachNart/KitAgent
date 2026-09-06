import { getFaucets } from '../data/faucets';

const rules = [
  [/revoke|revoke.*approval/i, 'approve'],
  [/faucet|testnet/i, 'faucet'],
  [/nft.*(sell|list|offer)|list.*nft|sell.*nft/i, 'nft_sell'],
  [/nft.*(buy|purchase)|buy.*nft/i, 'nft_buy'],
  [/nft.*(send|transfer)|send.*nft|transfer.*nft/i, 'nft_transfer'],
  [/nft|opensea|collection|marketplace/i, 'nft'],
  [/swap|exchange/i, 'swap'], [/bridge/i, 'bridge'],
  [/lend|loan|borrow/i, 'lending'], [/liquidity|lp|pool/i, 'liquidity'],
  [/stake|unstake/i, 'staking'], [/yield|apy|apr/i, 'yield'],
  [/approve|allowance/i, 'approve'], [/batch|multiple transaction/i, 'batch'],
  [/contract|smart contract/i, 'contract'], [/send|transfer|pay/i, 'transfer'],
  [/buy|sell|long|short|trade/i, 'trade'], [/airdrop|claim/i, 'airdrop'],
  [/governance|vote|dao/i, 'governance'], [/gas|fee/i, 'gas'],
  [/portfolio|balance|holdings|positions/i, 'portfolio'],
  [/degen|memecoin|meme coin/i, 'degen'], [/rwa|real world asset/i, 'rwa'],
  [/gaming|gamefi/i, 'gaming'], [/wallet|connect/i, 'wallet'],
];

export function detectIntent(input = '') { return rules.find(([pattern]) => pattern.test(input))?.[1] || 'general'; }

const safety = 'I prepare first, show route, fees, approvals and risk, then wait for explicit terminal confirmation and wallet approval. Nothing is silently signed or broadcast.';

export function respondToIntent(input) {
  const intent = detectIntent(input);
  const copy = {
    faucet: 'Tell me the testnet and asset. I will use verified public faucet sources only.',
    nft_sell: 'NFT sell/list: identify asset → choose supported marketplace → price/currency → inspect fees, approvals and expiry → confirm → wallet approval.',
    nft_buy: 'NFT buy: identify collection/token → verify asset and seller → review price, fees and gas → confirm → wallet approval.',
    nft_transfer: 'NFT transfer: recipient → network → collection/token ID → ownership check → gas preview → confirm → wallet approval.',
    nft: 'NFT mode covers discovery, ownership, transfers, listings, offers, purchases and marketplace actions where a real adapter supports them.',
    swap: `Swap ready. ${safety} I need input token, output token, amount and network.`,
    bridge: `Bridge ready. ${safety} I need source chain, destination chain, asset and amount.`,
    lending: `Lending ready. I can prepare supply, withdraw, borrow and repay for a supported protocol/market.`,
    liquidity: `Liquidity ready. I can prepare add/remove LP actions and surface pool conditions and price impact where supported.`,
    staking: `Staking ready. I can prepare stake/unstake actions for supported protocols and show lock or unbonding terms.`,
    yield: 'Yield ready. I can compare supported opportunities and risks. APY changes and is never guaranteed.',
    approve: 'Approval security mode: I will show token, spender, current allowance and proposed allowance before authorization. Revoke requests are handled as allowance reductions.',
    batch: `Batch ready. I will decompose each action, validate ordering and present the complete transaction set before authorization.`,
    contract: 'Contract mode requires a known target and decoded call parameters. Reads can be inspected; writes require full transaction review and wallet approval.',
    transfer: `Transfer ready. ${safety} I need recipient, asset, amount and network.`,
    trade: 'Trading requires structure, liquidity, delivery, volatility and risk/reward gates. If the setup fails the gates, the correct signal is no trade.',
    airdrop: 'Airdrop mode can inspect verifiable claim flows. I will never invent eligibility, contracts or links.',
    governance: 'Governance mode can inspect supported proposals and prepare votes for wallet approval.',
    gas: 'Gas mode estimates fees for supported networks and identifies the asset needed for gas.',
    portfolio: 'Portfolio mode can summarize supported wallet assets, positions and activity when wallet/on-chain data is available.',
    degen: 'Degen mode can research high-risk assets and surface liquidity, contract and concentration warnings. It never guarantees safety or returns.',
    rwa: 'RWA mode can discover supported tokenized-asset protocols and explain eligibility, custody and transfer restrictions.',
    gaming: 'Gaming mode can discover supported on-chain games, assets and marketplace actions.',
    wallet: 'Wallet mode handles supported EVM connection and wallet context. Signing remains a wallet-controlled approval step.',
    general: `Tell me what you want done. I can route across crypto, DeFi, NFTs, marketplaces, trading, wallets, payments and on-chain operations. ${safety}`,
  };
  return { intent, text: copy[intent] };
}
export function faucetLinks(network) { return getFaucets(network); }
