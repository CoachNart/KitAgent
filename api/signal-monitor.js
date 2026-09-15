import { getAdmin, resolveStatus, currentPrice } from './signals.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  const expected=process.env.CRON_SECRET;
  const auth=req.headers.authorization||'';
  if(!expected || auth!==`Bearer ${expected}`)return json(res,401,{error:'Unauthorized monitor request.'});
  try{
    const db=getAdmin().firestore();
    const snapshot=await db.collectionGroup('signals').where('status','in',['open','limit_pending']).limit(250).get();
    let updated=0,closed=0,missed=0,ambiguous=0;
    for(const doc of snapshot.docs){
      const signal={id:doc.id,...doc.data()};
      const price=await currentPrice(signal);
      const next=await resolveStatus(signal,price);
      const changed=['status','result','pnlPercent','exitPrice','closedAt','activatedAt','missedAt','outcomeEvidence'].some(k=>String(signal[k]??'')!==String(next[k]??''));
      if(!changed)continue;
      const patch={status:next.status,result:next.result??null,pnlPercent:next.pnlPercent??null,exitPrice:next.exitPrice??null,closedAt:next.closedAt??null,missedAt:next.missedAt??null,outcomeEvidence:next.outcomeEvidence??null};
      if(next.activatedAt)patch.activatedAt=next.activatedAt;
      await doc.ref.set(patch,{merge:true});
      updated++;
      if(next.status==='target_hit')closed++;
      if(next.status==='stop_hit')closed++;
      if(next.status==='missed_entry')missed++;
      if(next.ambiguousOutcome)ambiguous++;
    }
    return json(res,200,{ok:true,checked:snapshot.size,updated,closed,missed,ambiguous});
  }catch(error){return json(res,500,{error:error?.message||'Signal monitor failed.'});}
}
