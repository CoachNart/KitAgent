import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { WagmiProvider } from 'wagmi';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';
import { queryClient, wagmiAdapter } from './walletkit.jsx';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import './brand.css';
import './overrides.css';
import './command-center-overrides.css';
import './agent-terminal.css';
import './home.css';
import './account-page.css';
import './signal-history.css';
import './protected-pages.css';
import './contentProtection.js';
import './cexTerminal.js';
import './cexEnhancements.js';
import './cexPersistence.js';

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
        }catch(error){console.warn('KitSetups deep-link handling failed:',error)}
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

function Root(){
  const content=<><NativeLifecycle /><AuthGate>{user => <App user={user} />}</AuthGate></>;
  if(!wagmiAdapter) return content;
  return <WagmiProvider config={wagmiAdapter.wagmiConfig}><QueryClientProvider client={queryClient}>{content}</QueryClientProvider></WagmiProvider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Root /></React.StrictMode>
);
