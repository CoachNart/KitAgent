const crypto = [
  ['BTC/USDT','Bitcoin',65000,1.8,'$2.4B'],['ETH/USDT','Ethereum',2500,2.2,'$1.5B'],['SOL/USDT','Solana',145,3.1,'$620M'],['XRP/USDT','XRP',0.62,-0.8,'$310M'],['BNB/USDT','BNB',580,1.2,'$290M'],['DOGE/USDT','Dogecoin',0.12,2.7,'$280M'],['ADA/USDT','Cardano',0.45,-0.4,'$170M'],['AVAX/USDT','Avalanche',35,1.6,'$160M'],['LINK/USDT','Chainlink',15.5,2.9,'$145M'],['DOT/USDT','Polkadot',7.1,-1.1,'$120M'],['TRX/USDT','TRON',0.14,0.6,'$105M'],['LTC/USDT','Litecoin',72,1.1,'$98M'],['BCH/USDT','Bitcoin Cash',380,-0.7,'$91M'],['UNI/USDT','Uniswap',8.4,2.3,'$88M'],['ATOM/USDT','Cosmos',6.3,-0.2,'$75M'],['NEAR/USDT','NEAR Protocol',5.2,3.4,'$73M'],['APT/USDT','Aptos',8.1,1.5,'$70M'],['ARB/USDT','Arbitrum',0.82,-2.0,'$68M'],['OP/USDT','Optimism',1.7,0.9,'$65M'],['SUI/USDT','Sui',1.35,4.1,'$62M'],['FIL/USDT','Filecoin',4.7,-0.5,'$58M'],['ETC/USDT','Ethereum Classic',24,1.0,'$54M'],['XLM/USDT','Stellar',0.11,0.4,'$50M'],['ALGO/USDT','Algorand',0.18,-1.2,'$44M'],['ICP/USDT','Internet Computer',8.9,2.0,'$43M'],['INJ/USDT','Injective',22,3.6,'$41M'],['SEI/USDT','Sei',0.39,1.7,'$38M'],['PEPE/USDT','Pepe',0.000012,2.5,'$36M'],['TON/USDT','Toncoin',5.9,-0.3,'$34M'],['MATIC/USDT','Polygon',0.48,0.8,'$32M']
].map(([symbol,name,price,change,liquidity]) => ({ symbol,name,price,change,liquidity }));

const forex = [
  ['EUR/USD','Euro / US Dollar',1.0842,0.12],['GBP/USD','British Pound / US Dollar',1.2735,-0.18],['USD/JPY','US Dollar / Japanese Yen',149.62,0.31],['USD/CHF','US Dollar / Swiss Franc',0.8972,-0.07],['AUD/USD','Australian Dollar / US Dollar',0.6541,0.22],['USD/CAD','US Dollar / Canadian Dollar',1.3618,-0.14],['NZD/USD','New Zealand Dollar / US Dollar',0.6112,0.16],['EUR/GBP','Euro / British Pound',0.8512,-0.09],['EUR/JPY','Euro / Japanese Yen',162.18,0.26],['GBP/JPY','British Pound / Japanese Yen',190.52,0.41],['AUD/JPY','Australian Dollar / Japanese Yen',97.84,0.33],['USD/SGD','US Dollar / Singapore Dollar',1.3438,-0.05],['USD/NOK','US Dollar / Norwegian Krone',10.62,0.27],['USD/SEK','US Dollar / Swedish Krona',10.31,0.19],['USD/MXN','US Dollar / Mexican Peso',17.18,-0.36]
].map(([symbol,name,price,change]) => ({ symbol,name,price,change,liquidity:'Institutional' }));

export const CRYPTO_PAIRS = crypto;
export const FOREX_PAIRS = forex;
export const cryptoPairs = crypto.map((p) => p.symbol);
export const forexPairs = forex.map((p) => p.symbol);
export const pairs = [...cryptoPairs, ...forexPairs];
export const TIMEFRAMES = ['1m','5m','15m','30m','1H','4H','1D','1W'];

export const decisionRules = ['External + internal liquidity mapping','Market structure: BOS / CHOCH','Change in state of delivery','Displacement and reclaim confirmation','Volatility-aware stop placement','Minimum 2.5:1 risk/reward target','No-trade state when confluence is weak'];
