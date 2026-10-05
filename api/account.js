import registerDeviceHandler from '../server/register-device.js';
import verifyPaymentHandler from '../server/verify-payment.js';

export default function handler(req,res){
  const action=String(req.query?.action||'').toLowerCase();
  if(action==='register-device')return registerDeviceHandler(req,res);
  if(action==='verify-payment')return verifyPaymentHandler(req,res);
  res.statusCode=404;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({error:'Unsupported account action'}));
}
