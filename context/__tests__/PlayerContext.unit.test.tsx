import * as React from 'react';
import { act, render } from '@testing-library/react-native';
import { AppState, View } from 'react-native';
import { getStatus } from '@services';
import { PlayerProvider } from '../PlayerContext';

jest.mock('../../stores/usePlayerStore', () => ({
  usePlayerStore: (() => {
    const state: any = {};
    return {
      getState: jest.fn(() => state),
      setState: jest.fn((update: any) => Object.assign(state, update)),
    };
  })(),
}));

jest.mock('@services', () => ({
  clampPlaybackPositionMs: (positionMs: number, durationMs: number) =>
    durationMs > 0 ? Math.min(Math.max(0, positionMs), durationMs) : positionMs,
  getAudioDiagnosticsSnapshot: jest.fn(() => []),
  getStatus: jest.fn(),
  reconcilePlaybackDurationMs: (reported?: number, canonical?: number) =>
    reported || canonical || 0,
  recordAudioDiagnostic: jest.fn(),
  releaseAllPreloadedAudio: jest.fn(),
}));

const mockPlayerStore = jest.requireMock('../../stores/usePlayerStore').usePlayerStore;

describe('PlayerProvider status reconciliation', () => {
  const originalAppState = AppState.currentState;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPlayerStore.setState({
      currentTrack: { spotifyId: 'track-1', duration_ms: 180_000 },
      isLoadingAudio: false,
      playerState: {
        isPlaying: false,
        isBuffering: false,
        isLoaded: false,
        positionMs: 0,
        durationMs: 180_000,
      },
    });
    mockPlayerStore.getState.mockClear();
    mockPlayerStore.setState.mockClear();
    (AppState as any).currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({
      remove: jest.fn(),
    } as any);
    jest.mocked(getStatus).mockReturnValue({
      isPlaying: true,
      isBuffering: false,
      isLoaded: true,
      positionMs: 2500,
      durationMs: 180_000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (AppState as any).currentState = originalAppState;
  });

  it('reconciles live playback state so controls and progress do not stay stale', async () => {
    await render(
      <PlayerProvider>
        <View />
      </PlayerProvider>
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(mockPlayerStore.setState).toHaveBeenCalledWith({
      isLoadingAudio: false,
      playerState: {
        isPlaying: true,
        isBuffering: false,
        isLoaded: true,
        positionMs: 2500,
        durationMs: 180_000,
      },
    });
  });
});
