import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCachedArtistImage } from '../artistImageCache';

describe('getCachedArtistImage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
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
});
