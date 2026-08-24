const { chmod, mkdir, readFile, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

const NETSCAPE_COOKIE_HEADER = /^(?:# HTTP Cookie File|# Netscape HTTP Cookie File)(?:\r?\n|$)/;

const validateCookieFile = (contents, sourceName) => {
  if (!NETSCAPE_COOKIE_HEADER.test(contents)) {
    throw new Error(`${sourceName} must contain a Netscape cookie file`);
  }

  return contents;
};

const decodeBase64Cookies = (encoded) => {
  const normalized = encoded.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('YOUTUBE_COOKIES_BASE64 must be valid base64');
  }

  return Buffer.from(normalized, 'base64').toString('utf8');
};

const resolveYoutubeCookiesPath = async ({
  env = process.env,
  temporaryDirectory = tmpdir(),
} = {}) => {
  const configuredPath = env.YOUTUBE_COOKIES_PATH?.trim();
  if (configuredPath) {
    const contents = await readFile(configuredPath, 'utf8');
    validateCookieFile(contents, 'YOUTUBE_COOKIES_PATH');
    return configuredPath;
  }

  const encodedCookies = env.YOUTUBE_COOKIES_BASE64?.trim();
  if (!encodedCookies) return null;

  const contents = validateCookieFile(
    decodeBase64Cookies(encodedCookies),
    'YOUTUBE_COOKIES_BASE64'
  );
  await mkdir(temporaryDirectory, { recursive: true });

  const cookiePath = path.join(temporaryDirectory, `openfy-youtube-cookies-${process.pid}.txt`);
  await writeFile(cookiePath, contents, { encoding: 'utf8', mode: 0o600 });
  await chmod(cookiePath, 0o600);
  return cookiePath;
};

module.exports = { resolveYoutubeCookiesPath };
