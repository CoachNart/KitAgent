const DEFAULT_FEE_BPS=25;
const FREE_LIMITS={advancedRoutes:3,automations:0,apiCalls:100};
export const PLANS={
  free:{id:'free',name:'Free',price:0,description:'Core self-custody execution',features:['Wallet + portfolio','Native transfers','Gas intelligence','Basic execution','Limited route automation']},
  pro:{id:'pro',name:'Pro',price:19,description:'Autonomous on-chain execution',features:['Unlimited smart routes','Gas optimization','DCA + limit intents','Advanced risk + simulation','Priority agent execution','Multi-wallet workflows']},
  developer:{id:'developer',name:'Developer',price:99,description:'KitAgent API',features:['API access','Usage analytics','Webhook-ready events','Sandbox routing','Developer support']},
  startup:{id:'startup',name:'Startup',price:499,description:'Embedded execution infrastructure',features:['Higher API limits','White-label agent','Team controls','Usage reporting','Priority support']}
};
export function feeConfig(){
  const bps=Number(import.meta.env.VITE_KITAGENT_FEE_BPS||DEFAULT_FEE_BPS);
  return {bps:Number.isFinite(bps)&&bps>=0&&bps<10000?bps:DEFAULT_FEE_BPS,integrator:import.meta.env.VITE_KITAGENT_LIFI_INTEGRATOR||'kitagent'};
}
export function serviceFee(amount){const n=Number(amount||0);return Number.isFinite(n)&&n>0?n*feeConfig().bps/10000:0}
export function feeRate(){return feeConfig().bps/10000}
export function feeLabel(){return `${(feeConfig().bps/100).toFixed(2)}%`}
export function plan(){return localStorage.getItem('kitagent_plan')||'free'}
export function setPlan(id){if(PLANS[id])localStorage.setItem('kitagent_plan',id)}
export function isPro(){return ['pro','developer','startup'].includes(plan())}
export function usage(){try{return JSON.parse(localStorage.getItem('kitagent_usage')||'{"routes":0,"automations":0,"apiCalls":0,"volume":0,"fees":0}')}catch{return {routes:0,automations:0,apiCalls:0,volume:0,fees:0}}}
export function recordUsage({type='routes',volume=0,fee=0}={}){const u=usage();u[type]=(u[type]||0)+1;u.volume+=(Number(volume)||0);u.fees+=(Number(fee)||0);localStorage.setItem('kitagent_usage',JSON.stringify(u));return u}
export function canUse(type='advancedRoutes'){if(isPro())return true;const u=usage();return (u[type]||0)<(FREE_LIMITS[type]??Infinity)}
export function revenueProjection(volume,feeBps=feeConfig().bps){return {bps:feeBps,monthly:Number(volume||0)*feeBps/10000,annual:Number(volume||0)*feeBps/10000*12}}
