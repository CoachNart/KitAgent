export function noTrade(failures=[]){
  return {
    grade:'NO-TRADE',
    score:0,
    hardFailures:[...new Set(failures.filter(Boolean))]
  };
}
