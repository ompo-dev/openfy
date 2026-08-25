import { resolveMusicServerUrl } from '../constants';

describe('resolveMusicServerUrl', () => {
  it('keeps localhost for web development', () => {
    expect(
      resolveMusicServerUrl({
        configuredUrl: 'http://localhost:3001',
        platform: 'web',
      })
    ).toBe('http://localhost:3001');
  });

  it('derives the LAN backend from Metro for an iPhone', () => {
    expect(
      resolveMusicServerUrl({
        configuredUrl: 'http://localhost:3001',
        developmentHost: '192.168.100.27:8081',
        platform: 'ios',
      })
    ).toBe('http://192.168.100.27:3001');
  });

  it('uses an explicitly configured non-loopback server on native', () => {
    expect(
      resolveMusicServerUrl({
        configuredUrl: 'https://music.openfy.example/',
        developmentHost: '192.168.100.27:8081',
        platform: 'ios',
      })
    ).toBe('https://music.openfy.example');
  });

  it('uses the Vercel URL on Android without falling back to Metro', () => {
    expect(
      resolveMusicServerUrl({
        configuredUrl: 'https://openfy-api.vercel.app/',
        developmentHost: '192.168.100.27:8081',
        platform: 'android',
      })
    ).toBe('https://openfy-api.vercel.app');
  });

  it('never returns phone localhost when no LAN host is available', () => {
    expect(
      resolveMusicServerUrl({
        configuredUrl: 'http://localhost:3001',
        platform: 'ios',
      })
    ).toBe('');
  });
});
