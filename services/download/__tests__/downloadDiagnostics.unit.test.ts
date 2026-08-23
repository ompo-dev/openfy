import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  _resetDownloadDiagnosticsForTests,
  formatDownloadDiagnostics,
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
});
