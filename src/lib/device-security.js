const DEVICE_KEY='kitagent_device_id';

function randomId(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export function deviceId(){
  try{
    let id=localStorage.getItem(DEVICE_KEY);
    if(!id){id=randomId();localStorage.setItem(DEVICE_KEY,id)}
    return id;
  }catch{return randomId()}
}

async function digest(value){
  const data=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function fingerprint(){
  const nav=navigator;
  const screenInfo=window.screen||{};
  const raw=[
    nav.userAgent||'',nav.language||'',Intl.DateTimeFormat().resolvedOptions().timeZone||'',
    `${screenInfo.width||0}x${screenInfo.height||0}x${screenInfo.colorDepth||0}`,
    nav.platform||'',nav.hardwareConcurrency||'',nav.maxTouchPoints||'',
  ].join('|');
  return digest(raw);
}

export async function securityHeaders(token){
  return {
    Authorization:`Bearer ${token}`,
    'X-KitAgent-Device':deviceId(),
    'X-KitAgent-Fingerprint':await fingerprint(),
    'Content-Type':'application/json',
  };
}
