import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const kitAgentSourceFix = () => ({
  name: 'kitagent-source-fix',
  enforce: 'pre',
  transform(source, id) {
    if (id.endsWith('/src/App.jsx')) {
      return { code: source.replaceAll('<Clipboard/>', '<Copy/>'), map: null };
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
