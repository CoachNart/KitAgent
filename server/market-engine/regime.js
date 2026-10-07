export function regime(c,s){
 if(!s||s.direction==='NEUTRAL')return s?.compression?'COMPRESSION': 'RANGE';
 if(s.expansion)return 'EXPANSION';
 if(s.compression)return 'COMPRESSION';
 return s.direction==='BULLISH'?'BULLISH_TREND':'BEARISH_TREND';
}
