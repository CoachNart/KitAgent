const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
const YES=/^(yes|y|approve|approved|confirm|confirmed|go ahead|do it|send it|proceed|execute|list it|sell it)$/i;
const NO=/^(no|n|cancel|stop|abort|never mind|nevermind)$/i;
const ADDRESS_GLOBAL=/0x[a-fA-F0-9]{40}/g;
export const isAddress=v=>ADDRESS.test(String(v||'').trim());
export const isYes=v=>YES.test(String(v||'').trim());
export const isNo=v=>NO.test(String(v||'').trim());
export function addresses(text=''){return [...String(text).matchAll(ADDRESS_GLOBAL)].map(m=>m[0])}
export function parseAmount(text=''){const m=String(text).match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:eth|ether|bnb|matic|arb|op|usdc|usdt|dai|weth)?\b/i);return m?.[1]||null}
export function parseTokenSymbol(text=''){const m=String(text).match(/\b(USDC|USDT|DAI|WETH|ETH|BNB|MATIC|SOL)\b/i);return m?.[1]?.toUpperCase()||null}
export function parseTokenContract(text=''){return addresses(text)[0]||null}
export function parseSpender(text=''){return addresses(text)[1]||null}
export function parseTokenAndSpender(text=''){const a=addresses(text);return {token:a[0]||null,spender:a[1]||null}}
export function parseNft(text=''){
  const raw=String(text);const a=addresses(raw);
  const contract=raw.match(/(?:contract|collection)\s+(0x[a-fA-F0-9]{40})/i)?.[1]||a[1]||null;
  const recipient=raw.match(/(?:to|recipient)\s+(0x[a-fA-F0-9]{40})/i)?.[1]||a[0]||null;
  const tokenId=raw.match(/(?:nft|token|#|id)\s*#?\s*(\d+)/i)?.[1]||raw.match(/#(\d+)/)?.[1]||null;
  return {addresses:a,recipient,contract,tokenId}
}
export function parseSwap(text=''){const amount=parseAmount(text);const symbols=[...String(text).matchAll(/\b(USDC|USDT|DAI|WETH|ETH|BNB|MATIC)\b/gi)].map(m=>m[1].toUpperCase());return {amount,from:symbols[0]||null,to:symbols[1]||null}}
export function parseBridge(text=''){const p=parseSwap(text);const m=String(text).match(/\bto\s+([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*)/i);return {...p,destination:m?.[1]?.trim()||null}}
export function parseDeFiCommand(text=''){const l=String(text).toLowerCase();return {action:l.match(/\b(supply|deposit|borrow|repay|withdraw|stake|unstake)\b/)?.[1]||null,amount:parseAmount(text),token:parseTokenSymbol(text)}}
export function parseApproval(text=''){const a=addresses(text);return {token:a[0]||null,spender:a[1]||null,amount:parseAmount(text),symbol:parseTokenSymbol(text)}}
export function commandNeedsConfirmation(text=''){return !isYes(text)&&!isNo(text)}
