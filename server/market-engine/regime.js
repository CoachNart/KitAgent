export function regime(c,s){
 if(!s||s.direction==='NEUTRAL')return s?.compression?'COMPRESSION': 'RANGE';
 if(s.expansion)return 'EXPANSION';
 if(s.compression)return 'COMPRESSION';
 return s.direction==='BULLISH'?'BULLISH_TREND':'BEARISH_TREND';
}
export function location(c,entry,direction,htfLevels=[]){
 const near=htfLevels.filter(x=>Math.abs(x.level-entry)<=Math.max((c.at(-1)?.close||entry)*.004,(c.at(-1)?.close||entry)*.002));
 return near.length?near[0]:null;
}
