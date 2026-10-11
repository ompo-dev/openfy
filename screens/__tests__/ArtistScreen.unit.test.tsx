import { act, render, waitFor } from '@testing-library/react-native';
import { getArtist, findArtistIdByName, getCachedYouTubeMusicArtistProfile, getCachedArtistSearchSeed,
  getYouTubeMusicArtistProfile, subscribeYouTubeMusicArtistProfile } from '@api';
import { usePlayer } from '@context';
import { getLibraryTracks, rememberCachedArtistImage } from '@services';
import { ArtistScreen } from '../ArtistScreen';
import { resolveTrackArtist } from '../../services/search/artistIdentity';

jest.mock('../../services/search/artistIdentity', () => ({
  ...jest.requireActual('../../services/search/artistIdentity'), resolveTrackArtist: jest.fn(),
}));
jest.mock('@api', () => ({
  getArtist: jest.fn(), findArtistIdByName: jest.fn(),
  getCachedYouTubeMusicArtistProfile: jest.fn(), getCachedArtistSearchSeed: jest.fn(),
  getYouTubeMusicArtistProfile: jest.fn(), subscribeYouTubeMusicArtistProfile: jest.fn(() => () => {}),
  getYouTubeMusicAlbum: jest.fn().mockResolvedValue({ artists: [] }),
  getArtistCatalogImage: jest.fn().mockResolvedValue(''),
}));
jest.mock('@context', () => ({ usePlayer: jest.fn() }));
jest.mock('@services', () => ({
  getLibraryTracks: jest.fn(), rememberCachedArtistImage: jest.fn().mockResolvedValue(undefined),
  getCachedArtistImage: jest.fn().mockResolvedValue(''),
}));
jest.mock('@components', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { CollectionDetail: ({ title, collectionId, tracks, imageURL, loadingError, extraTrackSections }: any) =>
    React.createElement(View, null,
      React.createElement(Text, null, title),
      React.createElement(Text, { testID: 'channel-id' }, collectionId),
      React.createElement(Text, { testID: 'artist-image' }, imageURL || '<empty>'),
      React.createElement(Text, null, 'track-count:' + tracks.length),
      React.createElement(Text, null, 'participation-count:' + (extraTrackSections?.[0]?.tracks.length || 0)),
      React.createElement(Text, null, loadingError || '<no-error>')) };
});
jest.mock('../../components/Slider', () => ({ Slider: () => null }));

const id = 'ytartist_UCnative~Native';
const recording = { id: 'yt_abcdefghijk', youtubeVideoId: 'abcdefghijk', title: 'Song',
  subtitle: 'Native', artists: [{ id, name: 'Native' }] };
const channelProfile = { artist: { id, type: 'artist', name: 'Native', imageURL: 'portrait.jpg' },
  tracks: [recording], participationTracks: [], albums: [], singlesAndEps: [] };

describe('YouTube-native artist screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(usePlayer).mockReturnValue({ currentTrack: null } as never);
    jest.mocked(getLibraryTracks).mockResolvedValue([]);
    jest.mocked(getCachedArtistSearchSeed).mockReturnValue(null);
    jest.mocked(getCachedYouTubeMusicArtistProfile).mockReturnValue(null);
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue(channelProfile as never);
    jest.mocked(resolveTrackArtist).mockResolvedValue({ id: '', name: 'Native' });
  });

  it('loads the linked YouTube channel and never consults Spotify for an artist profile', async () => {
    const screen = await render(<ArtistScreen artistId={id} />);
    await waitFor(() => expect(screen.getByText('track-count:1')).toBeTruthy());
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledWith(id);
    expect(screen.getByTestId('channel-id').props.children).toBe(id);
    expect(getArtist).not.toHaveBeenCalled();
    expect(findArtistIdByName).not.toHaveBeenCalled();
    expect(rememberCachedArtistImage).toHaveBeenCalledWith('Native', 'portrait.jpg', [id]);
  });

  it('does not manufacture a channel for a name-only route', async () => {
    await render(<ArtistScreen artistId="ytartist_name_Native" />);
    await waitFor(() => expect(getLibraryTracks).toHaveBeenCalled());
    expect(getYouTubeMusicArtistProfile).not.toHaveBeenCalled();
    expect(findArtistIdByName).not.toHaveBeenCalled();
  });

  it('migrates a legacy link only through its saved recording channel reference', async () => {
    const legacy = { ...recording, artists: [{ id: 'legacy-provider-id', name: 'Native' }] };
    jest.mocked(getLibraryTracks).mockResolvedValue([legacy] as never);
    jest.mocked(resolveTrackArtist).mockResolvedValue({ id, name: 'Native' });
    const screen = await render(<ArtistScreen artistId="legacy-provider-id" />);
    await waitFor(() => expect(screen.getByText('track-count:1')).toBeTruthy());
    expect(resolveTrackArtist).toHaveBeenCalledWith(legacy.artists[0], legacy);
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledWith(id);
    expect(screen.getByTestId('channel-id').props.children).toBe(id);
  });

  it('does not supplement a channel catalog with same-name library recordings', async () => {
    jest.mocked(getLibraryTracks).mockResolvedValue([{ ...recording, id: 'foreign',
      artists: [{ id: 'ytartist_UCother~Native', name: 'Native' }] }] as never);
    const screen = await render(<ArtistScreen artistId={id} />);
    await waitFor(() => expect(screen.getByText('track-count:1')).toBeTruthy());
    expect(getLibraryTracks).not.toHaveBeenCalled();
  });

  it('publishes channel metadata before the full catalog resolves', async () => {
    let publish!: (value: typeof channelProfile) => void;
    let finish!: (value: typeof channelProfile) => void;
    jest.mocked(subscribeYouTubeMusicArtistProfile).mockImplementation((_, listener) => {
      publish = listener as typeof publish;
      return () => {};
    });
    jest.mocked(getYouTubeMusicArtistProfile).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const screen = await render(<ArtistScreen artistId={id} />);
    await act(async () => publish({ ...channelProfile, tracks: [] }));
    expect(screen.getByTestId('artist-image').props.children).toBe('portrait.jpg');
    await act(async () => finish(channelProfile));
    expect(screen.getByText('track-count:1')).toBeTruthy();
  });

  it('keeps playback changes from resetting the loaded profile', async () => {
    const screen = await render(<ArtistScreen artistId={id} />);
    await waitFor(() => expect(screen.getByText('track-count:1')).toBeTruthy());
    jest.mocked(usePlayer).mockReturnValue({ currentTrack: recording } as never);
    await screen.rerender(<ArtistScreen artistId={id} />);
    jest.mocked(usePlayer).mockReturnValue({ currentTrack: null } as never);
    await screen.rerender(<ArtistScreen artistId={id} />);
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('artist-image').props.children).toBe('portrait.jpg');
  });

  it('keeps only explicitly linked search seed recordings if the channel is offline', async () => {
    jest.mocked(getCachedArtistSearchSeed).mockReturnValue({ artist: channelProfile.artist,
      tracks: [recording, { ...recording, id: 'other', artists: [{ id: 'ytartist_UCother~Native', name: 'Native' }] }] } as never);
    jest.mocked(getYouTubeMusicArtistProfile).mockRejectedValue(new Error('Offline'));
    const screen = await render(<ArtistScreen artistId={id} />);
    await waitFor(() => expect(screen.getByText('track-count:1')).toBeTruthy());
    expect(screen.getByTestId('artist-image').props.children).toBe('portrait.jpg');
    expect(getArtist).not.toHaveBeenCalled();
  });

  it('uses the channel header identity even when opened through an old alias', async () => {
    const screen = await render(<ArtistScreen artistId="ytartist_UCnative~Old%20alias" />);
    await waitFor(() => expect(screen.getByText('Native')).toBeTruthy());
    expect(screen.getByTestId('channel-id').props.children).toBe(id);
  });

  it('unsubscribes the progressive channel resource when leaving the profile', async () => {
    const stop = jest.fn();
    jest.mocked(subscribeYouTubeMusicArtistProfile).mockReturnValue(stop);
    const screen = await render(<ArtistScreen artistId={id} />);
    await waitFor(() => expect(screen.getByText('track-count:1')).toBeTruthy());
    await screen.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
