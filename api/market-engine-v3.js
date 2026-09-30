 const hh=h.p>ph.p,lh=h.p<ph.p,hl=l.p>pl.p,ll=l.p<pl.p;
 const a=Math.max(atr(c,14)||0,Math.abs(c.at(-1)?.close||0)*.0008),avg=sma(c.slice(-20).map(x=>x.high-x.low),20)||a,breaks=[];
 const scan=(levels,dir)=>{for(const p of levels.slice(-6).reverse()){for(let i=p.i+1;i<c.length;i++){const x=c[i],r=x.high-x.low,b=Math.abs(x.close-x.open),cross=dir==='LONG'?x.close>p.p:x.close<p.p;if(!cross)continue;const distance=Math.abs(x.close-p.p);breaks.push({level:p.p,index:i,age:c.length-1-i,distance,significant:distance>=Math.max(a*.18,avg*.08)&&r>=avg*.8&&b/r>=.45});break;}}};
 scan(highs,'LONG');scan(lows,'SHORT');
 const longBreak=breaks.filter(x=>x.significant&&c[x.index]?.close>x.level&&x.age<=12).sort((x,y)=>x.age-y.age)[0]||null;
 const shortBreak=breaks.filter(x=>x.significant&&c[x.index]?.close<x.level&&x.age<=12).sort((x,y)=>x.age-y.age)[0]||null;
 const bullish=hh&&hl,bearish=lh&&ll;
 let bias=bullish&&!bearish?'LONG':bearish&&!bullish?'SHORT':'WAIT',strength=bias==='WAIT'?0:3;
 if(longBreak&&!shortBreak){bias='LONG';strength+=3}
 if(shortBreak&&!longBreak){bias='SHORT';strength+=3}
 if(longBreak&&shortBreak){
  const latest=longBreak.age<=shortBreak.age?longBreak:shortBreak;
  bias=latest===longBreak?'LONG':'SHORT';
  strength=3+(latest.significant?3:0);
 }
 const protectedLow=bullish?l:null,protectedHigh=bearish?h:null,current=c.at(-1)?.close;
 if((bias==='LONG'&&protectedLow&&current<protectedLow.p)||(bias==='SHORT'&&protectedHigh&&current>protectedHigh.p)){bias='WAIT';strength=0}
 return{bias,strength,bos:bias==='LONG'?longBreak:bias==='SHORT'?shortBreak:null,choch:bias==='LONG'?!!shortBreak:bias==='SHORT'?!!longBreak:false,protectedHigh,protectedLow,breaks};
}
function trend(c){return structureState(c).bias}
function structuralDirection(context,structure,execution){
 if(!context||!structure||context.bias==='WAIT'||structure.bias==='WAIT'||context.bias!==structure.bias)return{bias:'WAIT',score:0};
 if(execution?.bias!=='WAIT'&&execution?.bias!==context.bias)return{bias:'WAIT',score:0};
 return{bias:context.bias,score:(context.strength||0)+(structure.strength||0)+(execution?.strength||0)};