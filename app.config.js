const apiOrigin =
  process.env.EXPO_PUBLIC_MUSIC_SERVER_URL || process.env.EXPO_PUBLIC_API_URL || '';

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
          'Openfy conecta ao servidor Expo apenas durante desenvolvimento.',
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
      output: 'server',
      favicon: './assets/images/app-icon/openfy-light.png',
    },
    plugins: [
      'expo-router',
      'expo-asset',
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
      clientID: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || process.env.CLIENT_ID || '',
      tokenKey: process.env.TOKEN_KEY || 'spotify_token',
      musicServerUrl: apiOrigin,
      refreshTokenKey: process.env.REFRESH_TOKEN_KEY || 'spotify_refresh_token',
      expirationKey: process.env.EXPIRATION_KEY || 'spotify_expiration_key',
      authorizationEndpoint:
        process.env.AUTHORIZATION_ENDPOINT ||
        'https://accounts.spotify.com/authorize',
      tokenEndpoint:
        process.env.TOKEN_ENDPOINT || 'https://accounts.spotify.com/api/token',
      router: {},
      eas: { projectId: '33b0281a-b127-47fe-ab16-e94caf272493' },
    },
  },
};
