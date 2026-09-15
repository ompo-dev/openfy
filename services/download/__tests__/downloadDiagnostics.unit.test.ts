import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  _resetDownloadDiagnosticsForTests,
  formatDownloadDiagnostics,
  ensurePlaybackDiagnostics,
  getDownloadDiagnostics,
  recordDownloadDiagnostic,
  startDownloadDiagnostics,
} from '../downloadDiagnostics';

describe('download diagnostics', () => {
  beforeEach(async () => {
    _resetDownloadDiagnosticsForTests();
    await AsyncStorage.clear();
  });

  it('BUG-R2: keeps request metadata but redacts signed URL values in copied logs', async () => {
    await startDownloadDiagnostics({
      spotifyId: 'track_1',
      title: 'Faixa',
      artistName: 'Artista',
      albumName: 'Álbum',
      imageURL: '',
      duration_ms: 120000,
    });
    recordDownloadDiagnostic('track_1', 'audio.request', {
      url: 'https://rr1.googlevideo.test/audio.m4a?expire=123&sig=secret-value',
      error: 'GET https://rr1.googlevideo.test/audio.m4a?expire=123&sig=secret-value failed',
    });

    await expect(formatDownloadDiagnostics('track_1')).resolves.toContain(
      'https://rr1.googlevideo.test/audio.m4a?expire=…&sig=…'
    );
    await expect(formatDownloadDiagnostics('track_1')).resolves.not.toContain(
      'secret-value'
    );
  });

  it('creates an exportable playback log without counting a download attempt', async () => {
    await ensurePlaybackDiagnostics({
      spotifyId: 'track_playback',
      title: 'Faixa',
      artistName: 'Artista',
      albumName: 'Álbum',
      imageURL: '',
      duration_ms: 120000,
    });
    recordDownloadDiagnostic('track_playback', 'player.app-state', {
      note: 'background',
    });

    await expect(getDownloadDiagnostics('track_playback')).resolves.toMatchObject({
      attempts: 0,
      events: expect.arrayContaining([
        expect.objectContaining({ phase: 'player.diagnostics.started' }),
        expect.objectContaining({ phase: 'player.app-state' }),
      ]),
    });
  });

  it('redacts signed URLs inside nested playback state errors', async () => {
    await ensurePlaybackDiagnostics({
      spotifyId: 'track_nested',
      title: 'Faixa',
      artistName: 'Artista',
      albumName: 'Álbum',
      imageURL: '',
      duration_ms: 120000,
    });
    recordDownloadDiagnostic('track_nested', 'player.playback-error', {
      state: {
        error:
          'AVPlayer failed https://rr1.googlevideo.test/audio.m4a?expire=123&sig=secret-value',
      },
    });

    await expect(formatDownloadDiagnostics('track_nested')).resolves.toContain(
      'https://rr1.googlevideo.test/audio.m4a?expire=…&sig=…'
    );
    await expect(formatDownloadDiagnostics('track_nested')).resolves.not.toContain(
      'secret-value'
    );
  });

  it('keeps in-memory diagnostics bounded to the exported track capacity', async () => {
    for (let index = 0; index < 30; index++) {
      await ensurePlaybackDiagnostics({
        spotifyId: `track_${index}`,
        title: `Faixa ${index}`,
        artistName: 'Artista',
        albumName: 'Álbum',
        imageURL: '',
        duration_ms: 120000,
      });
    }

    await expect(getDownloadDiagnostics('track_0')).resolves.toBeNull();
    await expect(getDownloadDiagnostics('track_29')).resolves.toBeTruthy();
  });
});
