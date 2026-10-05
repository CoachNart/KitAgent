const ORDER=['A+','A','B','C','NO-TRADE'];
export function grade(f){
 if(f.hardFailures?.length)return {grade:'NO-TRADE',score:0,hardFailures:f.hardFailures};
 let score=0;
 score+=f.htfAlignment?25:0;score+=f.structureClarity?20:0;score+=f.liquidity?15:0;score+=f.location?10:0;score+=f.confirmation?15:0;score+=f.target?10:0;score+=f.rr>=3?5:f.rr>=2?2:0;
 const grade=score>=90?'A+':score>=78?'A':score>=62?'B':score>=45?'C':'NO-TRADE';
 return {grade,score,hardFailures:[]};
}
export function noTrade(failures){return {grade:'NO-TRADE',score:0,hardFailures:[...new Set(failures)]};}
