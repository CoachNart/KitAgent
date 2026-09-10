import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kitagent.app',
  appName: 'KitSetups',
  webDir: 'dist',
  android: {
    backgroundColor: '#07090c'
  },
  server: {
    androidScheme: 'https',
    url: 'https://kitsetups.xyz'
  }
};

export default config;
