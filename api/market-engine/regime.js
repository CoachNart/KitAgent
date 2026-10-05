import {rangeAverage} from './data.js';
export function regime(c,s){
 if(!s||s.direction==='NEUTRAL')return s?.compression?'COMPRESSION': 'RANGE';
 if(s.expansion)return 'EXPANSION';
 if(s.compression)return 'COMPRESSION';
 return s.direction==='BULLISH'?'BULLISH_TREND':'BEARISH_TREND';
}
export function location(c,entry,direction,htfLevels=[]){
 const near=htfLevels.filter(x=>Math.abs(x.level-entry)<=Math.max((c.at(-1)?.close||entry)*.004,(s?.atr||0)*1.5));
 return near.length?near[0]:null;
}
