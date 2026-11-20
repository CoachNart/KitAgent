// Shared crypto-only universe guard for live Bybit scanning and historical replay.
// Excludes tokenized equities, indices and commodity contracts even when a
// provider lists them as linear USDT perpetual swaps.
const CRYPTO_BASES=new Set([
  'BTC','ETH','SOL','XRP','BNB','DOGE','ADA','TRX','LINK','AVAX','BCH','DOT',
  'LTC','UNI','NEAR','APT','SUI','ARB','OP','FIL','ETC','XLM','TON','ATOM',
  'INJ','SEI','TIA','WLD','PEPE','SHIB','BONK','WIF','FET','RENDER','TAO',
  'JUP','PYTH','HBAR','ICP','AAVE','MKR','CRV','LDO','ENA','ONDO','PENDLE',
  'EIGEN','ZK','ZRO','STRK','IMX','GRT','STX','KAS','XMR','HYPE','POL',
  'VET','ALGO','FTM','SAND','MANA','AXS','GALA','RUNE','THETA','EGLD',
  'FLOW','CHZ','COMP','SNX','DYDX','GMX','ORDI','SATS','BOME','FLOKI',
  '1000PEPE','1000SHIB','1000BONK','1000FLOKI','1000SATS','JTO','JASMY',
  'QNT','RAY','MNT','MANTA','BLUR','ENS','MINA','ROSE','ZEC','DASH',
  'KAVA','CELO','IOTA','XTZ','EOS','NEO','W','TURBO','NOT','CATI',
  'MEW','BRETT','POPCAT','TRUMP','VIRTUAL','AI16Z','FARTCOIN','KAITO',
  'MMT','CRO','BTT','XEC','KCS','OKB','ZIL','ONT','ANKR','1INCH','API3',
  'AR','LPT','BAND','COTI','RVN','WAXP','IOTX','MASK','YFI','SUSHI'
]);

export function isSupportedCryptoBase(base){
  return CRYPTO_BASES.has(String(base||'').toUpperCase());
}

export function isSupportedCryptoPerpetualSymbol(symbol){
  const value=String(symbol||'').toUpperCase();
  if(!value.endsWith('USDT'))return false;
  return isSupportedCryptoBase(value.slice(0,-4));
}
