import { resolveMusicServerUrl } from '../constants';

describe('resolveMusicServerUrl', () => {
  it('uses the current web origin when no API origin is configured', () => {
    const originalWindow = global.window;
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost:8081' } },
    });

    try {
      expect(
        resolveMusicServerUrl({
          platform: 'web',
        })
      ).toBe('http://localhost:8081');
    } finally {
      Object.defineProperty(global, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it('uses the Expo API Route origin on an iPhone during development', () => {
    expect(
      resolveMusicServerUrl({
        developmentHost: '192.168.100.27:8081',
        platform: 'ios',
      })
    ).toBe('http://192.168.100.27:8081');
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
