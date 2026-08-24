export type YoutubeCredentialEnvironment = {
  YOUTUBE_COOKIES_PATH?: string;
  YOUTUBE_COOKIES_BASE64?: string;
};

export type YoutubeCookieOptions = {
  env?: YoutubeCredentialEnvironment;
  temporaryDirectory?: string;
};

export function resolveYoutubeCookiesPath(
  options?: YoutubeCookieOptions
): Promise<string | null>;
