import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  resolveYoutubeCookieHeader,
  resolveYoutubeCookiesPath,
} from '../youtubeCredentials';

const cookies = [
  '# Netscape HTTP Cookie File',
  '.youtube.com\tTRUE\t/\tTRUE\t2147483647\tVISITOR_INFO1_LIVE\tvisitor-token',
].join('\n');

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('resolveYoutubeCookiesPath', () => {
  it('returns null when no server-side YouTube credential is configured', async () => {
    await expect(resolveYoutubeCookiesPath({})).resolves.toBeNull();
  });

  it('materializes a validated base64 Netscape cookie file in the temporary directory', async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'openfy-youtube-test-'));
    temporaryDirectories.push(temporaryDirectory);

    const cookiePath = await resolveYoutubeCookiesPath({
      env: { YOUTUBE_COOKIES_BASE64: Buffer.from(cookies).toString('base64') },
      temporaryDirectory,
    });

    expect(cookiePath).toContain(temporaryDirectory);
    await expect(readFile(cookiePath!, 'utf8')).resolves.toBe(cookies);
  });

  it('converts YouTube entries into an authenticated InnerTube cookie header', async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'openfy-youtube-test-'));
    temporaryDirectories.push(temporaryDirectory);
    const cookieFile = [
      cookies,
      '.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSID\tsession-token',
      '.google.com\tTRUE\t/\tTRUE\t2147483647\tSID\tgoogle-session',
    ].join('\n');

    await expect(
      resolveYoutubeCookieHeader({
        env: { YOUTUBE_COOKIES_BASE64: Buffer.from(cookieFile).toString('base64') },
        temporaryDirectory,
      })
    ).resolves.toBe('VISITOR_INFO1_LIVE=visitor-token; SID=session-token');
  });

  it('rejects a cookie payload that is not in Netscape format', async () => {
    await expect(
      resolveYoutubeCookiesPath({
        env: { YOUTUBE_COOKIES_BASE64: Buffer.from('not a cookie file').toString('base64') },
      })
    ).rejects.toThrow('YOUTUBE_COOKIES_BASE64 must contain a Netscape cookie file');
  });
});
