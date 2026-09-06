import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import marketHandler from './api/market.js';
import perpetualHandler from './api/perpetual.js';

const localMarketApi = () => ({
  name: 'kitagent-local-market-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/market') && !req.url?.startsWith('/api/perpetual')) return next();
      try {
        const url = new URL(req.url, 'http://localhost');
        req.query = Object.fromEntries(url.searchParams.entries());
        const handler = req.url.startsWith('/api/perpetual') ? perpetualHandler : marketHandler;
        await handler(req, res);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: error?.message || 'Local market API failed' }));
      }
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/market') && !req.url?.startsWith('/api/perpetual')) return next();
      try {
        const url = new URL(req.url, 'http://localhost');
        req.query = Object.fromEntries(url.searchParams.entries());
        const handler = req.url.startsWith('/api/perpetual') ? perpetualHandler : marketHandler;
        await handler(req, res);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: error?.message || 'Preview market API failed' }));
      }
    });
  },
});

const kitAgentSourceFix = () => ({
  name: 'kitagent-source-fix',
  enforce: 'pre',
  transform(source, id) {
    if (id.endsWith('/src/App.jsx')) {
      let code = source.replaceAll('<Clipboard/>', '<Copy/>');
      code = code.replace(
        "const connectWallet=async()=>{",
        "const getWalletProvider=()=>window.ethereum?.providers?.find(p=>p?.isMetaMask)||window.ethereum;const connectWallet=async()=>{"
      );
      code = code.replaceAll('window.ethereum.request', 'getWalletProvider()?.request');
      code = `import LiveMarketPage from './LiveMarketPage.jsx';\nimport ChartTerminal from './ChartTerminal.jsx';\nimport AccountPage from './AccountPage.jsx';\nimport './account-page.css';\n${code}`;
      code = code.replace(
        '<MarketPage pair={pair} setPair={setPair} tf={tf} setTf={setTf} analyzed={analyzed} setAnalyzed={setAnalyzed}/>',
        '<LiveMarketPage/>'
      );
      code = code.replace("['defi','DeFi & actions',Layers3]", "['defi','Chart terminal',BarChart3]");
      code = code.replace("<DeFiPage prepare={prepare}/>", "<ChartTerminal/>");
      code = code.replace('<b>DeFi</b><small>Swap, bridge, stake, lend and borrow.</small>', '<b>Chart terminal</b><small>Confirm market setups with live technical charts.</small>');
      code = code.replace("['drops','Airdrops & faucets',Rocket]", "['drops','Profile',UserRound]");
      code = code.replace("['profile','Profile',UserRound]", '');
      code = code.replace(
        '<DropsPage prepare={prepare} wallet={wallet}/>',
        '<AccountPage user={user} wallet={wallet} connectWallet={connectWallet}/>'
      );
      code = code.replace(
        '<ProfilePage wallet={wallet} connectWallet={connectWallet} user={user}/>',
        '<AccountPage user={user} wallet={wallet} connectWallet={connectWallet}/>'
      );
      return { code, map: null };
    }
    if (id.endsWith('/src/LiveMarketPage.jsx')) {
      return { code: `import './live-market-final.css';\n${source}`, map: null };
    }
    if (id.endsWith('/src/ChartTerminal.jsx')) {
      return { code: `import './chart-terminal.css';\nimport './chart-terminal-overrides.css';\n${source}`, map: null };
    }
    return null;
  },
});

export default defineConfig({
  plugins: [localMarketApi(), kitAgentSourceFix(), react()],
  server: { port: 3000, open: true, strictPort: false },
  build: { target: 'es2020', outDir: 'dist', sourcemap: false },
  preview: { port: 4173 },
});
