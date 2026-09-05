import admin from 'firebase-admin';

function app(){
  if(admin.apps.length)return admin.app();
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  const service=JSON.parse(raw);
  return admin.initializeApp({credential:admin.credential.cert(service)});
}

export function firestore(){return admin.firestore(app())}
export async function verifyBearer(req){
  const header=req.headers.authorization||'';
  if(!header.startsWith('Bearer '))throw Object.assign(new Error('Authentication required'),{status:401});
  return admin.auth(app()).verifyIdToken(header.slice(7));
}
