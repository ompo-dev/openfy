import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { MixDetail } from '../MixDetail';
import { getMixProject } from '../../../services/mix/mixRepository';
import { downloadMixSources, renderMixAudio } from '../../../services/mix/mixAudio';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import type { MixProject } from '../../../services/mix/mixTimeline';
const mockPlay = jest.fn().mockResolvedValue(undefined);
const mockSeek = jest.fn().mockResolvedValue(undefined);
let mockProps: any;
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }),
  useFocusEffect: (effect: any) => jest.requireActual('react').useEffect(effect, [effect]) }));
jest.mock('../../CollectionDetail', () => ({ CollectionDetail: (props: any) => { mockProps = props; return null; } }));
jest.mock('../../CollectionDetail/PendingCollectionDetail', () => ({ PendingCollectionDetail: () => null }));
jest.mock('../../LocalPlaylist/PlaylistTrackPickerModal', () => ({ PlaylistTrackPickerModal: () => null }));
jest.mock('../MixEditorModal', () => ({ MixEditorModal: () => null }));
jest.mock('../../../stores/usePlayerStore', () => ({ usePlayerStore: { getState: () => ({ playWithQueue: mockPlay, seekToPosition: mockSeek }) } }));
jest.mock('../../../services/mix/mixRepository', () => ({ getMixProject: jest.fn() }));
jest.mock('../../../services/mix/mixAudio', () => ({ downloadMixSources: jest.fn(), renderMixAudio: jest.fn() }));
jest.mock('../../../services/library/catalogLibrary', () => ({ getLibraryTracks: jest.fn().mockResolvedValue([]) }));
const project: MixProject = { version: 1, id: 'local_mix_flow', title: 'Treino', description: '', revision: 2,
  createdAt: '', updatedAt: '', tracks: ['one', 'two'].map((id) => ({ spotifyId: id, title: id, artistName: id, imageURL: '', albumName: '', duration_ms: 60000 })),
  clips: [ { id: 'a', trackId: 'one', sourceStartMs: 10000, sourceEndMs: 20000, volume: 1 },
    { id: 'b', trackId: 'two', sourceStartMs: 0, sourceEndMs: 5000, volume: 1 } ] };
beforeEach(() => {
  jest.clearAllMocks(); mockProps = undefined;
  jest.mocked(getMixProject).mockResolvedValue(project);
  jest.mocked(downloadMixSources).mockResolvedValue(undefined);
  jest.mocked(renderMixAudio).mockResolvedValue({ uri: 'file:///mix.m4a', durationMs: 15000 });
});
it('composes and plays the saved edits locally, seeking to the selected source without losing a request when downloads refresh the library', async () => {
  await render(<MixDetail mixId={project.id} />);
  await waitFor(() => expect(mockProps?.title).toBe('Treino'));
  let finish!: () => void;
  jest.mocked(downloadMixSources).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  let playback!: Promise<void>;
  await act(async () => { playback = mockProps.onPlayMix('two'); });
  await act(async () => { useLibraryStore.getState().refreshLibrary(); });
  await waitFor(() => expect(getMixProject).toHaveBeenCalledTimes(3));
  await act(async () => { finish(); await playback; });
  expect(renderMixAudio).toHaveBeenCalledWith(project);
  expect(mockPlay).toHaveBeenCalledWith([expect.objectContaining({ localOnly: true, localAudioPath: 'file:///mix.m4a', duration_ms: 15000 })], 0,
    'playlist:local_mix_flow:revision:2');
  expect(mockSeek).toHaveBeenCalledWith(10000);
  expect(mockProps.playbackSourceId).toBe('playlist:local_mix_flow:revision:2');
});
