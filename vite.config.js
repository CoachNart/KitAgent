import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      code = `import LiveMarketPage from './LiveMarketPage.jsx';\n${code}`;
      code = code.replace(
        '<MarketPage pair={pair} setPair={setPair} tf={tf} setTf={setTf} analyzed={analyzed} setAnalyzed={setAnalyzed}/>',
        '<LiveMarketPage/>'
      );
      return { code, map: null };
    }
    if (id.endsWith('/src/LiveMarketPage.jsx')) {
      return { code: `import './live-market-final.css';\n${source}`, map: null };
    }
    return null;
  },
});

export default defineConfig({
  plugins: [kitAgentSourceFix(), react()],
  server: { port: 3000, open: true, strictPort: false },
  build: { target: 'es2020', outDir: 'dist', sourcemap: false },
  preview: { port: 4173 },
});
