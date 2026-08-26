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

  it('uses the browser-compatible YouTube client when extracting audio', async () => {
    const engine = await readFile(new URL('../legacyEngine.js', import.meta.url), 'utf8');

    expect(engine).toContain('retrieve_player: true');
    expect(engine).toContain('requestOptions: cookie ? { headers: { cookie } } : undefined');
    expect(engine).toContain("format: 'best[ext=mp4]/bestaudio/best'");
    expect(engine).toContain("extractorArgs: 'youtube:player_client=web_safari,android,ios'");
  });
});
