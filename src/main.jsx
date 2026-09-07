import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';
import CommandAgentBridge from './CommandAgentBridge.jsx';
import './styles.css';
import './brand.css';
import './overrides.css';
import './command-center-overrides.css';
import './agent-terminal.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>{user => <CommandAgentBridge><App user={user} /></CommandAgentBridge>}</AuthGate>
  </React.StrictMode>
);
