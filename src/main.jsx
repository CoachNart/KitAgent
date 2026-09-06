import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';
import './styles.css';
import './brand.css';
import './overrides.css';
import './command-center-overrides.css';
import './mobile-wallet.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>{user => <App user={user} />}</AuthGate>
  </React.StrictMode>
);
