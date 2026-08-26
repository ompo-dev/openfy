import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import packageJson from '../../package.json';

describe('Next runtime scripts', () => {
  it('does not force Next to run inside Bun', () => {
    expect(packageJson.scripts.dev).not.toContain('bun --bun next');
    expect(packageJson.scripts.start).not.toContain('bun --bun next');
  });

  it('allows Bun to install the reviewed yt-dlp binary dependency', () => {
    expect(packageJson.trustedDependencies).toContain('youtube-dl-exec');
  });

  it('ships the TypeScript native compiler for the Linux audio container', () => {
    expect(packageJson.optionalDependencies['@typescript/typescript-linux-x64']).toBe('7.0.2');
  });

  it('uses the browser-compatible YouTube client when extracting audio', async () => {
    const engine = await readFile(new URL('../legacyEngine.js', import.meta.url), 'utf8');

    expect(engine).toContain('retrieve_player: true');
    expect(engine).toContain('const ytdlpResult = await fetchYouTubeTrackViaYtDlp');
    expect(engine).toContain('InnerTube returned no playable stream');
    expect(engine).toContain('ytdl-core failed');
    expect(engine).toContain("format: 'best[ext=mp4]/bestaudio/best'");
    expect(engine).toContain("'youtube:player_client=tv,web_embedded,android_vr'");
    expect(engine).toContain("'youtube:player_client=default,android;formats=missing_pot'");
    expect(engine).toContain("'youtube:player_client=web_safari,android,ios'");
  });

  it('ships the persistent audio engine with Node and Python for yt-dlp', async () => {
    const dockerfile = await readFile(new URL('../../../../Dockerfile.vercel', import.meta.url), 'utf8');

    expect(dockerfile).toContain('python3');
    expect(dockerfile).toContain('FROM node:22-bookworm-slim');
    expect(dockerfile).toContain('node node_modules/next/dist/bin/next start');
  });

  it('routes public requests to the Vercel container service', async () => {
    const config = JSON.parse(
      await readFile(new URL('../../../../vercel.json', import.meta.url), 'utf8')
    );

    expect(config.services.audio).toEqual({
      root: '.',
      entrypoint: 'Dockerfile.vercel',
      runtime: 'container',
    });
    expect(config.rewrites).toEqual([
      { source: '/(.*)', destination: { service: 'audio' } },
    ]);
  });

  it('keeps the API-root Vercel project on the container runtime too', async () => {
    const config = JSON.parse(
      await readFile(new URL('../../vercel.json', import.meta.url), 'utf8')
    );
    const dockerfile = await readFile(
      new URL('../../Dockerfile.vercel', import.meta.url),
      'utf8'
    );

    expect(config.services.audio.runtime).toBe('container');
    expect(config.services.audio.entrypoint).toBe('Dockerfile.vercel');
    expect(dockerfile).toContain('FROM node:22-bookworm-slim');
    expect(dockerfile).toContain('python3');
  });
});
