const LIFI = 'https://li.quest/v1/quote';

export async function getSwapOrBridgeQuote({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress }) {
  const params = new URLSearchParams({ fromChain: String(fromChain), toChain: String(toChain), fromToken, toToken, fromAmount, fromAddress });
  const response = await fetch(`${LIFI}?${params.toString()}`);
  if (!response.ok) throw new Error(`Routing service returned ${response.status}.`);
  const data = await response.json();
  return {
    tool: 'LI.FI',
    estimate: data.estimate,
    transactionRequest: data.transactionRequest,
    action: data.action,
  };
}
