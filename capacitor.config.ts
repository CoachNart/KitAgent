import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kitagent.app',
  appName: 'KitAgent',
  webDir: 'dist',
  android: {
    backgroundColor: '#07090c'
  },
  server: {
    androidScheme: 'https',
    url: 'https://www.kit-agent.xyz'
  }
};

export default config;
