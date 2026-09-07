import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';
import './styles.css';
import './brand.css';
import './overrides.css';
import './command-center-overrides.css';
import './agent-terminal.css';

function NativeLifecycle(){
  useEffect(()=>{
    if(!Capacitor.isNativePlatform()) return undefined;
    let backHandle;
    let urlHandle;
    let active=true;

    const setup=async()=>{
      backHandle=await CapacitorApp.addListener('backButton',({canGoBack})=>{
        if(!active) return;
        if(canGoBack) window.history.back();
        else CapacitorApp.exitApp();
      });
      urlHandle=await CapacitorApp.addListener('appUrlOpen',({url})=>{
        if(!active||!url) return;
        try{
          const parsed=new URL(url);
          if(parsed.pathname) window.history.replaceState({},'',`${parsed.pathname}${parsed.search}${parsed.hash}`);
          window.dispatchEvent(new CustomEvent('kitagent:app-url-open',{detail:{url}}));
        }catch(error){console.warn('KitAgent deep-link handling failed:',error)}
      });
    };
    setup();
    return()=>{
      active=false;
      backHandle?.remove();
      urlHandle?.remove();
    };
  },[]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NativeLifecycle />
    <AuthGate>{user => <App user={user} />}</AuthGate>
  </React.StrictMode>
);
