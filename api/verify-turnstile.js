function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  const secret=process.env.TURNSTILE_SECRET;
  if(!secret)return json(res,500,{error:'Security verification is not configured.',code:'TURNSTILE_NOT_CONFIGURED'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const token=String(body.token||'').trim();
    if(!token)return json(res,400,{error:'Complete the security check to continue.',code:'CAPTCHA_REQUIRED'});
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,response:token,remoteip:String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||undefined})});
    const result=await response.json();
    if(!response.ok||!result.success)return json(res,403,{error:'Security verification failed. Please try again.',code:'CAPTCHA_FAILED'});
    return json(res,200,{success:true});
  }catch(error){console.error('verify-turnstile failed',error);return json(res,500,{error:'Security verification could not be completed.',code:'CAPTCHA_VERIFICATION_FAILED'})}
}
