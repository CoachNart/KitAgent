import {
  prepareNativeTransfer,
  prepareTokenTransfer,
  unsupportedAction,
} from './onchain/index.js';

function extractAddress(text) {
  return String(text).match(/0x[a-fA-F0-9]{40}/)?.[0] || null;
}

function extractAmount(text) {
  const match = String(text).match(
    /\b\d+(?:\.\d+)?\b/,
  );

  return match?.[0] || null;
}

function normalizeCommand(command) {
  return String(command || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function detectIntent(command) {
  const text = command.toLowerCase();

  if (
    /\b(send|transfer)\b/.test(text) &&
    /0x[a-f0-9]{40}/i.test(command)
  ) {
    return 'send';
  }

  if (/\b(swap|exchange)\b/.test(text)) return 'swap';

  if (/\b(bridge|move.*chain|cross.?chain)\b/.test(text)) {
    return 'bridge';
  }

  if (/\b(buy|purchase)\b/.test(text)) return 'buy';

  if (/\b(sell|dump)\b/.test(text)) return 'sell';

  if (/\b(nft|erc721|erc1155)\b/.test(text)) return 'nft';

  if (
    /\b(lend|supply|deposit.*morpho|earn.*yield)\b/.test(text)
  ) {
    return 'lend';
  }

  if (/\b(borrow|loan)\b/.test(text)) return 'borrow';

  if (/\b(stake|staking)\b/.test(text)) return 'stake';

  if (/\b(withdraw|unstake)\b/.test(text)) return 'withdraw';

  if (/\b(claim|airdrop|faucet)\b/.test(text)) return 'claim';

  if (/\b(balance|wallet|portfolio)\b/.test(text)) {
    return 'wallet';
  }

  if (
    /\b(market|markets|apy|yield|tvl|morpho|opportunity)\b/.test(text)
  ) {
    return 'market';
  }

  return 'help';
}

function extractRecipient(command) {
  const addresses = String(command).match(
    /0x[a-fA-F0-9]{40}/g,
  );

  return addresses?.[0] || null;
}

export async function planCommand({
  command,
  wallet,
}) {
  const normalized = normalizeCommand(command);
  const intent = detectIntent(normalized);

  if (!normalized) {
    return {
      status: 'needs-input',
      intent: 'help',
      message: 'Tell me what you want to execute.',
    };
  }

  if (intent === 'send') {
    const recipient = extractRecipient(normalized);
    const amount = extractAmount(normalized);

    if (!wallet) {
      return {
        status: 'needs-input',
        intent,
        message: 'Connect your wallet first.',
      };
    }

    if (!recipient) {
      return {
        status: 'needs-input',
        intent,
        message: 'I need the recipient wallet address.',
      };
    }

    if (!amount) {
      return {
        status: 'needs-input',
        intent,
        message: 'I need the amount to send.',
      };
    }

    const nativeWords =
      /\b(eth|native|rbh|robinhood)\b/i.test(
        normalized,
      );

    if (nativeWords) {
      const plan = prepareNativeTransfer({
        from: wallet,
        recipient,
        amount,
      });

      return {
        status: 'ready',
        intent,
        ...plan,
      };
    }

    return {
      status: 'needs-input',
      intent,
      message:
        'I found the recipient and amount, but I need the token contract address for a token transfer.',
      recipient,
      amount,
    };
  }

  if (intent === 'wallet') {
    return {
      status: 'read-only',
      intent,
      message: 'Wallet inspection requested.',
    };
  }

  if (intent === 'market') {
    return {
      status: 'read-only',
      intent,
      message: 'Live market discovery requested.',
    };
  }

  if (
    ['swap', 'bridge', 'buy', 'sell', 'lend', 'borrow', 'stake', 'withdraw', 'nft', 'claim'].includes(
      intent,
    )
  ) {
    return {
      ...unsupportedAction(
        intent,
        `I detected a ${intent} operation, but I will not fabricate calldata, quotes, contracts or routes. A real protocol adapter must provide the transaction.`,
      ),
      intent,
    };
  }

  return {
    status: 'ready',
    intent: 'help',
    message:
      'I can handle wallet inspection, market discovery, native transfers and token transfers when the required contract data is supplied. Swap, bridge, NFT and DeFi execution must use verified protocol adapters.',
  };
}

export async function executePreparedPlan(plan) {
  if (!plan) {
    throw new Error('No execution plan');
  }

  if (!plan.execute) {
    throw new Error(
      plan.summary ||
        plan.message ||
        'This operation is not executable.',
    );
  }

  return plan.execute();
}

export {
  detectIntent,
  extractRecipient,
  extractAmount,
};
