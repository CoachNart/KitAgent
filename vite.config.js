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
      return { code, map: null };
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
