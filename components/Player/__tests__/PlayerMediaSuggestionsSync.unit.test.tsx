import * as React from 'react';
import { act, render } from '@testing-library/react-native';
import { PlayerMediaSuggestionsSync } from '../PlayerMediaSuggestionsSync';
import { getUserProfile } from '../../../services/recommendation/recommendationEngine';
import type { PlayerTrack } from '../../../stores/usePlayerStore';

const song = (spotifyId: string): PlayerTrack => ({ spotifyId, title: spotifyId, artistName: 'Ebony',
  artists: [{ id: 'ebony', name: 'Ebony' }], albumName: 'KM2', imageURL: 'cover', duration_ms: 150_000 });
const mockPlay = jest.fn();
const mockState = { currentTrack: song('current'), playerState: { isPlaying: true, error: null },
  queue: [song('current'), song('next')], queueIndex: 0, playTrack: mockPlay };
const mockBridge = { setSuggestedMediaAsync: jest.fn().mockResolvedValue(undefined),
  donatePlayedMediaAsync: jest.fn().mockResolvedValue(undefined),
  getPendingSuggestedMediaAsync: jest.fn().mockResolvedValue(null),
  acknowledgeSuggestedMediaAsync: jest.fn().mockResolvedValue(undefined),
  addListener: jest.fn(() => ({ remove: jest.fn() })) };
let mockLegacy = false;

jest.mock('expo', () => ({ requireOptionalNativeModule: () => mockLegacy ? {} : mockBridge }));
jest.mock('@context', () => ({ useAppSettings: () => ({ settings: { personalizedHome: true, allowExplicitRecommendations: true } }) }));
jest.mock('../../../stores/usePlayerStore', () => ({ usePlayerStore: Object.assign(
  (selector: (state: typeof mockState) => unknown) => selector(mockState), { getState: () => mockState }
) }));
jest.mock('../../../services/recommendation/recommendationEngine', () => ({ getUserProfile: jest.fn() }));
jest.mock('../../../services/home/homeRadio', () => ({ loadHomeRadio: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../utils/appLogger', () => ({ log: { error: jest.fn() } }));

const profile = { artistWeights: {}, genreWeights: {}, recentlyPlayedTracks: [], totalListens: 0 };

describe('player media suggestion sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLegacy = false;
    mockState.currentTrack = song('current');
    mockState.playerState = { isPlaying: true, error: null };
    mockBridge.getPendingSuggestedMediaAsync.mockResolvedValue(null);
    jest.mocked(getUserProfile).mockResolvedValue(profile);
  });

  it('prepares suggestions before the pause without including the playing track', async () => {
    await render(<PlayerMediaSuggestionsSync />);
    expect(mockBridge.donatePlayedMediaAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'current' }));
    expect(mockBridge.setSuggestedMediaAsync).toHaveBeenCalledWith([expect.objectContaining({ id: 'next' })]);
  });

  it('plays and acknowledges a pending lock-screen selection after app launch', async () => {
    const selected = song('selected');
    mockBridge.getPendingSuggestedMediaAsync.mockResolvedValueOnce({ requestId: 'request', trackJSON: JSON.stringify(selected) });
    mockPlay.mockImplementationOnce(async (track) => { mockState.currentTrack = track; });
    await render(<PlayerMediaSuggestionsSync />);
    expect(mockPlay).toHaveBeenCalledWith(selected);
    expect(mockBridge.acknowledgeSuggestedMediaAsync).toHaveBeenCalledWith('request', true);
  });

  it('does not publish late background results after unmounting', async () => {
    let resolve!: (value: typeof profile) => void;
    jest.mocked(getUserProfile).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = await render(<PlayerMediaSuggestionsSync />);
    await view.unmount();
    await act(async () => { resolve(profile); });
    expect(mockBridge.setSuggestedMediaAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps older iOS binaries working when the new native methods are missing', async () => {
    mockLegacy = true;
    await render(<PlayerMediaSuggestionsSync />);
    expect(mockBridge.setSuggestedMediaAsync).not.toHaveBeenCalled();
    expect(mockBridge.donatePlayedMediaAsync).not.toHaveBeenCalled();
  });
});
