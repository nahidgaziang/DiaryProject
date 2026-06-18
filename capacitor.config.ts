import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dailydrive.diary',
  appName: 'DailyDrive',
  webDir: 'dist',

  // Android-specific settings
  android: {
    backgroundColor: '#08131E',
    allowMixedContent: false,
  },

  // Plugin configurations
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#08131E',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#08131E',
      overlaysWebView: false,
    },
  },
};

export default config;
