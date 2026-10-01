import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  _clearArtistImageMemoryCacheForTests,
  getCachedArtistImage,
} from '../artistImageCache';

describe('getCachedArtistImage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    _clearArtistImageMemoryCacheForTests();
  });

  it('persists a resolved artist photo and reuses it without another lookup', async () => {
    const firstLookup = jest.fn().mockResolvedValue('https://images.test/artist.jpg');
    const secondLookup = jest.fn().mockResolvedValue('https://images.test/new-image.jpg');

    await expect(getCachedArtistImage('Artista Teste', firstLookup)).resolves.toBe(
      'https://images.test/artist.jpg'
    );
    await expect(getCachedArtistImage('Artista Teste', secondLookup)).resolves.toBe(
      'https://images.test/artist.jpg'
    );

    expect(firstLookup).toHaveBeenCalledTimes(1);
    expect(secondLookup).not.toHaveBeenCalled();
  });

  it('memoizes a missing photo during the current session', async () => {
    const firstLookup = jest.fn().mockResolvedValue('');
    const secondLookup = jest.fn().mockResolvedValue('https://images.test/artist.jpg');

    await expect(getCachedArtistImage('Artista sem foto', firstLookup)).resolves.toBe('');
    await expect(getCachedArtistImage('Artista sem foto', secondLookup)).resolves.toBe('');

    expect(firstLookup).toHaveBeenCalledTimes(1);
    expect(secondLookup).not.toHaveBeenCalled();
  });

  it('keeps Spotify portraits separate from YouTube images sharing the same artist name', async () => {
    const firstLookup = jest.fn().mockResolvedValue('https://images.test/eodan.jpg');
    const spotifyLookup = jest.fn().mockResolvedValue('https://images.test/eodan-spotify.jpg');
    const repeatedLookup = jest.fn().mockResolvedValue('https://images.test/different.jpg');

    await expect(getCachedArtistImage('ÉoDan', firstLookup, ['ytartist_UC123']))
      .resolves.toBe('https://images.test/eodan.jpg');
    _clearArtistImageMemoryCacheForTests();
    await expect(getCachedArtistImage('eodan', spotifyLookup, ['1234567890123456789012']))
      .resolves.toBe('https://images.test/eodan-spotify.jpg');
    await expect(getCachedArtistImage('EODAN', repeatedLookup, ['1234567890123456789012']))
      .resolves.toBe('https://images.test/eodan-spotify.jpg');

    expect(firstLookup).toHaveBeenCalledTimes(1);
    expect(spotifyLookup).toHaveBeenCalledTimes(1);
    expect(repeatedLookup).not.toHaveBeenCalled();
  });
});
