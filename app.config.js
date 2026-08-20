module.exports = {
  expo: {
    name: 'Openfy',
    slug: 'openfy',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/logo.png',
    scheme: 'openfy',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.openfy.app',
      icon: './assets/images/logo.png',
      ...(process.env.IOS_APPLE_TEAM_ID
        ? { appleTeamId: process.env.IOS_APPLE_TEAM_ID }
        : {}),
      supportsTablet: false,
    },
    android: {
      package: 'com.openfy.app',
      softwareKeyboardLayoutMode: 'pan',
      adaptiveIcon: {
        foregroundImage: './assets/images/logo.png',
        backgroundColor: '#121212',
      },
    },
    web: {
      bundler: 'metro',
      favicon: './assets/images/logo.png',
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
        'expo-splash-screen',
        {
          backgroundColor: '#121212',
          image: './assets/images/logo.png',
          imageWidth: 120,
          dark: {
            backgroundColor: '#121212',
            image: './assets/images/logo.png',
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
