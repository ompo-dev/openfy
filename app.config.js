const os = require('node:os');

const localDevelopmentMusicServerUrl = () => {
  if (process.env.EXPO_PUBLIC_MUSIC_SERVER_URL) {
    return process.env.EXPO_PUBLIC_MUSIC_SERVER_URL;
  }

  // A released build must receive an explicit HTTPS backend URL. During local
  // Expo development, expose the Node resolver through the same LAN address
  // that the iPhone uses for Metro instead of falling back to phone localhost.
  if (process.env.EAS_BUILD || process.env.CI) return '';

  for (const addresses of Object.values(os.networkInterfaces())) {
    const lan = addresses?.find(
      (address) =>
        address.family === 'IPv4' &&
        !address.internal &&
        (/^10\./.test(address.address) ||
          /^192\.168\./.test(address.address) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(address.address))
    );
    if (lan) return `http://${lan.address}:3001`;
  }

  return '';
};

module.exports = {
  expo: {
    name: 'Openfy',
    slug: 'openfy',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/app-icon/openfy-light.png',
    scheme: 'openfy',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.openfy.app',
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
        NSLocalNetworkUsageDescription:
          'Openfy usa rede local durante desenvolvimento para buscar música e letras no seu computador.',
      },
      icon: {
        light: './assets/images/app-icon/openfy-light.png',
        dark: './assets/images/app-icon/openfy-dark.png',
      },
      ...(process.env.IOS_APPLE_TEAM_ID
        ? { appleTeamId: process.env.IOS_APPLE_TEAM_ID }
        : {}),
      supportsTablet: false,
    },
    android: {
      package: 'com.openfy.app',
      icon: './assets/images/app-icon/openfy-dark.png',
      softwareKeyboardLayoutMode: 'pan',
      adaptiveIcon: {
        foregroundImage:
          './assets/images/app-icon/openfy-android-foreground.png',
        monochromeImage:
          './assets/images/app-icon/openfy-android-foreground.png',
        backgroundColor: '#000000',
      },
    },
    web: {
      bundler: 'metro',
      favicon: './assets/images/app-icon/openfy-light.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-audio',
        {
          enableBackgroundPlayback: true,
        },
      ],
      'expo-background-task',
      [
        'expo-notifications',
        {
          color: '#1ED760',
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#121212',
          // iOS renders its native splash from a PNG. This is the transparent
          // raster export of icon.svg, so the white Openfy mark has no square
          // background against the dark splash color.
          image: './assets/images/app-icon/openfy-android-foreground.png',
          imageWidth: 120,
          dark: {
            backgroundColor: '#121212',
            image: './assets/images/app-icon/openfy-android-foreground.png',
            imageWidth: 120,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      clientID: process.env.CLIENT_ID || '',
      clientSecret: process.env.CLIENT_SECRET || '',
      tokenKey: process.env.TOKEN_KEY || 'spotify_token',
      musicServerUrl: localDevelopmentMusicServerUrl(),
      refreshTokenKey: process.env.REFRESH_TOKEN_KEY || 'spotify_refresh_token',
      expirationKey: process.env.EXPIRATION_KEY || 'spotify_expiration_key',
      authorizationEndpoint:
        process.env.AUTHORIZATION_ENDPOINT ||
        'https://accounts.spotify.com/authorize',
      tokenEndpoint:
        process.env.TOKEN_ENDPOINT || 'https://accounts.spotify.com/api/token',
      router: { origin: false },
      eas: { projectId: '33b0281a-b127-47fe-ab16-e94caf272493' },
    },
  },
};
