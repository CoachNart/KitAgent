import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import marketHandler from './api/market.js';
import registerDeviceHandler from './server/register-device.js';
import verifyPaymentHandler from './server/verify-payment.js';
import signalsHandler from './api/signals.js';

function loadLocalFirebaseAdminEnv(mode){
  const env=loadEnv(mode,process.cwd(),'');
  if(env.FIREBASE_SERVICE_ACCOUNT_JSON)process.env.FIREBASE_SERVICE_ACCOUNT_JSON=env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON&&!process.env.GOOGLE_APPLICATION_CREDENTIALS){
    const files=[
      path.join(process.cwd(),'kitagent-a9fe8-firebase-adminsdk-fbsvc-440f5e3fbc.json'),
      path.join(os.homedir(),'kitagent-a9fe8-firebase-adminsdk-fbsvc-440f5e3fbc.json'),
      path.join(os.homedir(),'storage','downloads','kitagent-a9fe8-firebase-adminsdk-fbsvc-440f5e3fbc.json'),
      path.join(os.homedir(),'downloads','kitagent-a9fe8-firebase-adminsdk-fbsvc-440f5e3fbc.json')
    ];
    const found=files.find(file=>fs.existsSync(file));
    if(found)process.env.GOOGLE_APPLICATION_CREDENTIALS=found;
  }
}

const localApi=()=>({
  name:'kitagent-local-api',
  configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      if(!/^\/api\/(market|register-device|verify-payment|signals)/.test(req.url||''))return next();
      try{
        const url=new URL(req.url,'http://localhost');
        req.query=Object.fromEntries(url.searchParams.entries());
        if(req.url.startsWith('/api/register-device')||req.url.startsWith('/api/verify-payment')||req.url.startsWith('/api/signals')){
          loadLocalFirebaseAdminEnv('development');
          const chunks=[];for await(const chunk of req)chunks.push(chunk);
          req.body=Buffer.concat(chunks).toString('utf8');
          if(req.url.startsWith('/api/signals'))return signalsHandler(req,res);
          return req.url.startsWith('/api/verify-payment')?verifyPaymentHandler(req,res):registerDeviceHandler(req,res);
        }
        return marketHandler(req,res);
      }catch(error){
        res.statusCode=502;res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({ok:false,error:error?.message||'Local API failed'}));
      }
    });
  },
  configurePreviewServer(server){
    server.middlewares.use(async(req,res,next)=>{
      if(!/^\/api\/(market|register-device|verify-payment|signals)/.test(req.url||''))return next();
      try{
        const url=new URL(req.url,'http://localhost');
        req.query=Object.fromEntries(url.searchParams.entries());
        if(req.url.startsWith('/api/register-device')||req.url.startsWith('/api/verify-payment')||req.url.startsWith('/api/signals')){
          loadLocalFirebaseAdminEnv('production');
          const chunks=[];for await(const chunk of req)chunks.push(chunk);
          req.body=Buffer.concat(chunks).toString('utf8');
          if(req.url.startsWith('/api/signals'))return signalsHandler(req,res);
          return req.url.startsWith('/api/verify-payment')?verifyPaymentHandler(req,res):registerDeviceHandler(req,res);
        }
        return marketHandler(req,res);
      }catch(error){
        res.statusCode=502;res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({ok:false,error:error?.message||'Preview API failed'}));
      }
    });
  }
});

export default defineConfig({
  plugins:[localApi(),react()],
  server:{port:3000,host:true,open:true,strictPort:false},
  build:{target:'es2020',outDir:'dist',sourcemap:false},
  preview:{port:4173}
});
