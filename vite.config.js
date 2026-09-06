import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import marketHandler from './api/market.js';
import perpetualHandler from './api/perpetual.js';
import registerDeviceHandler from './api/register-device.js';

const localApi = () => ({
  name: 'kitagent-local-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/market') && !req.url?.startsWith('/api/perpetual') && !req.url?.startsWith('/api/register-device')) return next();
      try {
        const url = new URL(req.url, 'http://localhost');
        req.query = Object.fromEntries(url.searchParams.entries());
        if (req.url.startsWith('/api/register-device')) {
          const env = loadEnv('development', process.cwd(), '');
          if (env.FIREBASE_SERVICE_ACCOUNT_JSON) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = env.FIREBASE_SERVICE_ACCOUNT_JSON;
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          req.body = Buffer.concat(chunks).toString('utf8');
          return registerDeviceHandler(req, res);
        }
        return (req.url.startsWith('/api/perpetual') ? perpetualHandler : marketHandler)(req, res);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: error?.message || 'Local API failed' }));
      }
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/market') && !req.url?.startsWith('/api/perpetual') && !req.url?.startsWith('/api/register-device')) return next();
      try {
        const url = new URL(req.url, 'http://localhost');
        req.query = Object.fromEntries(url.searchParams.entries());
        if (req.url.startsWith('/api/register-device')) {
          const env = loadEnv('production', process.cwd(), '');
          if (env.FIREBASE_SERVICE_ACCOUNT_JSON) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = env.FIREBASE_SERVICE_ACCOUNT_JSON;
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          req.body = Buffer.concat(chunks).toString('utf8');
          return registerDeviceHandler(req, res);
        }
        return (req.url.startsWith('/api/perpetual') ? perpetualHandler : marketHandler)(req, res);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: error?.message || 'Preview API failed' }));
      }
    });
  }
});

const kitAgentSourceFix = () => ({
  name: 'kitagent-source-fix',
  enforce: 'pre',
  transform(source, id) {
    if (id.endsWith('/src/App.jsx')) {
      let code = source.replaceAll('<Clipboard/>', '<Copy/>');
      code = code.replace("const connectWallet=async()=>{", "const getWalletProvider=()=>window.ethereum?.providers?.find(p=>p?.isMetaMask)||window.ethereum;const connectWallet=async()=>{");
      code = code.replaceAll('window.ethereum.request', 'getWalletProvider()?.request');
      code = `import LiveMarketPage from './LiveMarketPage.jsx';\nimport ChartTerminal from './ChartTerminal.jsx';\nimport AccountPage from './AccountPage.jsx';\nimport AccessGate from './AccessGate.jsx';\nimport './account-page.css';\nimport './permission-modal.css';\n${code}`;
      code = code.replace('<MarketPage pair={pair} setPair={setPair} tf={tf} setTf={setTf} analyzed={analyzed} setAnalyzed={setAnalyzed}/>', '<AccessGate user={user}><LiveMarketPage/></AccessGate>');
      code = code.replace("['defi','DeFi & actions',Layers3]", "['defi','Chart terminal',BarChart3]");
      code = code.replace("<DeFiPage prepare={prepare}/>", "<AccessGate user={user}><ChartTerminal/></AccessGate>");
      code = code.replace('<b>DeFi</b><small>Swap, bridge, stake, lend and borrow.</small>', '<b>Chart terminal</b><small>Confirm market setups with live technical charts.</small>');
      code = code.replace("['drops','Airdrops & faucets',Rocket]", "['drops','Profile',UserRound]");
      code = code.replace("['profile','Profile',UserRound]", '');
      code = code.replace('<DropsPage prepare={prepare} wallet={wallet}/>', '<AccountPage user={user} wallet={wallet} connectWallet={connectWallet}/>');
      code = code.replace('<ProfilePage wallet={wallet} connectWallet={connectWallet} user={user}/>', '<AccountPage user={user} wallet={wallet} connectWallet={connectWallet}/>');
      code = code.replace("const go=p=>{setPage(p);setMobile(false)};", "const go=p=>{setPage(p);setMobile(false)};useEffect(()=>{const open=()=>go('profile');window.addEventListener('kitagent-open-profile',open);return()=>window.removeEventListener('kitagent-open-profile',open)},[]);");
      return { code, map: null };
    }
    if (id.endsWith('/src/LiveMarketPage.jsx')) return { code: `import './live-market-final.css';\n${source}`, map: null };
    if (id.endsWith('/src/ChartTerminal.jsx')) return { code: `import './chart-terminal.css';\nimport './chart-terminal-overrides.css';\n${source}`, map: null };
    return null;
  }
});

export default defineConfig({
  plugins: [localApi(), kitAgentSourceFix(), react()],
  server: { port: 3000, open: true, strictPort: false },
  build: { target: 'es2020', outDir: 'dist', sourcemap: false },
  preview: { port: 4173 }
});
