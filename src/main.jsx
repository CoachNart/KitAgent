import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';
import AccountDeletionPage from './AccountDeletionPage.jsx';
import VoiceTour from './VoiceTour.jsx';
import './styles.css';
import './brand.css';
import './overrides.css';
import './command-center-overrides.css';
import './home.css';
import './account-page.css';
import './account-deletion.css';
import './signal-history.css';
import './protected-pages.css';
import './mobile-nav.css';
import './contentProtection.js';
import './route-runtime.js';
import { startMarketAlerts } from './marketAlerts.js';
import { startAndroidPullToRefresh } from './androidPullToRefresh.js';

startMarketAlerts();

function NativeLifecycle(){
  useEffect(()=>{
    if(!Capacitor.isNativePlatform()) return undefined;
    let backHandle;
    let urlHandle;
    let active=true;
    const stopPullToRefresh = startAndroidPullToRefresh();
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
          if(parsed.pathname) window.history.replaceState({},'',parsed.pathname+parsed.search+parsed.hash);
          window.dispatchEvent(new CustomEvent('kitagent:app-url-open',{detail:{url}}));
        }catch(error){console.warn('KitSetups deep-link handling failed:',error)}
      });
    };
    setup();
    return()=>{
      active=false;
      stopPullToRefresh?.();
      backHandle?.remove();
      urlHandle?.remove();
    };
  },[]);
  return null;
}

function Root(){
  const publicPath=window.location.pathname.replace(/\/+$/,'')||'/';
  if(publicPath==='/delete-account')return <AccountDeletionPage/>;
  return <><NativeLifecycle /><AuthGate>{user => <App user={user} />}</AuthGate><VoiceTour /></>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Root /></React.StrictMode>
);
