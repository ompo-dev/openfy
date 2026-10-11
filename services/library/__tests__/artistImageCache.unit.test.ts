import AsyncStorage from '@react-native-async-storage/async-storage';
import { prefetchImage } from '../../images/imagePrefetch';
jest.mock('../../images/imagePrefetch', () => ({ prefetchImage: jest.fn().mockResolvedValue(true) }));

import {
  _clearArtistImageMemoryCacheForTests,
  getCachedArtistImage,
} from '../artistImageCache';

describe('getCachedArtistImage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
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
    expect(prefetchImage).toHaveBeenCalledWith('https://images.test/artist.jpg');
  });

  it('warms the persisted profile image bytes again after a new app launch', async () => {
    await getCachedArtistImage('Artist', async () => 'https://images.test/portrait.jpg', ['spotifyArtist0000000000']);
    _clearArtistImageMemoryCacheForTests();
    jest.mocked(prefetchImage).mockClear();
    const load = jest.fn();
    expect(await getCachedArtistImage('Artist', load, ['spotifyArtist0000000000'])).toBe('https://images.test/portrait.jpg');
    expect(load).not.toHaveBeenCalled();
    expect(prefetchImage).toHaveBeenCalledWith('https://images.test/portrait.jpg');
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

  it('keeps distinct YouTube artist identities separate when their names match', async () => {
    const firstLookup = jest.fn().mockResolvedValue('https://images.test/channel-one.jpg');
    const secondLookup = jest.fn().mockResolvedValue('https://images.test/channel-two.jpg');

    await expect(getCachedArtistImage('Artista', firstLookup, ['ytartist_channel-one']))
      .resolves.toBe('https://images.test/channel-one.jpg');
    await expect(getCachedArtistImage('Artista', secondLookup, ['ytartist_channel-two']))
      .resolves.toBe('https://images.test/channel-two.jpg');

    expect(firstLookup).toHaveBeenCalledTimes(1);
    expect(secondLookup).toHaveBeenCalledTimes(1);
  });

  it('shares persisted artwork between renamed routes to the same channel', async () => {
    const first = jest.fn().mockResolvedValue('https://images.test/sotam.jpg');
    const second = jest.fn();
    await getCachedArtistImage('Sotam', first, ['ytartist_UCHguBpZUpBR52kmx9DMCTFA~Sotam']);
    _clearArtistImageMemoryCacheForTests();
    expect(await getCachedArtistImage('RND', second, ['ytartist_UCHguBpZUpBR52kmx9DMCTFA~RND']))
      .toBe('https://images.test/sotam.jpg');
    expect(second).not.toHaveBeenCalled();
  });

  it('does not bridge two channel portraits through a shared imported provider id', async () => {
    const importedId = '1234567890123456789012';
    await getCachedArtistImage('Sid', async () => 'https://images.test/rapper.jpg',
      [importedId, 'ytartist_UCrapper~Sid']);
    _clearArtistImageMemoryCacheForTests();
    const load = jest.fn().mockResolvedValue('https://images.test/band.jpg');
    expect(await getCachedArtistImage('SID', load, [importedId, 'ytartist_UCband~SID']))
      .toBe('https://images.test/band.jpg');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not lowercase case-sensitive channel IDs in persistent cache keys', async () => {
    await getCachedArtistImage('Artist', async () => 'https://images.test/one.jpg', ['ytartist_UCAbC~Artist']);
    _clearArtistImageMemoryCacheForTests();
    const load = jest.fn().mockResolvedValue('https://images.test/two.jpg');
    expect(await getCachedArtistImage('Artist', load, ['ytartist_UCabc~Artist'])).toBe('https://images.test/two.jpg');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
