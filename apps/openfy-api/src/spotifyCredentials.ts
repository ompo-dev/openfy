type SpotifyAccessToken = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type CachedSpotifyToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedSpotifyToken | null = null;

const getSpotifyCredentials = () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

const requestSpotifyToken = async (parameters: URLSearchParams) => {
  const credentials = getSpotifyCredentials();
  if (!credentials) return null;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: parameters,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;

  return (await response.json()) as SpotifyAccessToken;
};

export const getSpotifyClientAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const token = await requestSpotifyToken(new URLSearchParams({ grant_type: 'client_credentials' }));
  if (!token?.access_token) return null;

  cachedToken = {
    accessToken: token.access_token,
    expiresAt:
      Date.now() + Math.max(60_000, ((Number(token.expires_in) || 3600) - 60) * 1000),
  };
  return cachedToken.accessToken;
};

export const refreshSpotifyUserAccessToken = async (refreshToken: string) => {
  if (!refreshToken.trim()) return null;
  return requestSpotifyToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  );
};
