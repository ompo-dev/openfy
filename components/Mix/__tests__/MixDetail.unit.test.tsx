import * as React from 'react';
import { Alert } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { MixDetail } from '../MixDetail';
import { getMixProject } from '../../../services/mix/mixRepository';
import { downloadMixSources, renderMixAudio } from '../../../services/mix/mixAudio';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import type { MixProject } from '../../../services/mix/mixTimeline';
const mockPlay = jest.fn().mockResolvedValue(undefined);
const mockSeek = jest.fn().mockResolvedValue(undefined);
const mockPause = jest.fn().mockResolvedValue(undefined);
const mockSetState = jest.fn();
let mockSourceId: string | null = null;
let mockDirty = false;
let mockEditorProps: any;
let mockProps: any;
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }),
  useFocusEffect: (effect: any) => jest.requireActual('react').useEffect(effect, [effect]) }));
jest.mock('../../CollectionDetail', () => ({ CollectionDetail: (props: any) => { mockProps = props; return props.beforeTracks || null; } }));
jest.mock('../../CollectionDetail/PendingCollectionDetail', () => ({ PendingCollectionDetail: () => null }));
jest.mock('../../LocalPlaylist/PlaylistTrackPickerModal', () => ({ PlaylistTrackPickerModal: () => null }));
jest.mock('../MixEditorModal', () => ({ MixEditor: (props: any) => {
  mockEditorProps = props;
  jest.requireActual('react').useImperativeHandle(props.editorRef, () => ({
    close: props.onClose, stop: jest.fn(), hasPendingEdits: () => mockDirty, flush: async () => !mockDirty,
  }));
  return null;
} }));
jest.mock('../../../stores/usePlayerStore', () => ({ usePlayerStore: { setState: (...args: unknown[]) => mockSetState(...args),
  getState: () => ({ playWithQueue: mockPlay, seekToPosition: mockSeek, queueSourceId: mockSourceId }) } }));
jest.mock('../../../services/audio/playerService', () => ({ pause: (...args: unknown[]) => mockPause(...args) }));
jest.mock('../../../services/mix/mixRepository', () => ({ getMixProject: jest.fn() }));
jest.mock('../../../services/mix/mixAudio', () => ({ downloadMixSources: jest.fn(), renderMixAudio: jest.fn() }));
jest.mock('../../../services/library/catalogLibrary', () => ({ getLibraryTracks: jest.fn().mockResolvedValue([]) }));
const project: MixProject = { version: 1, id: 'local_mix_flow', title: 'Treino', description: '', revision: 2,
  createdAt: '', updatedAt: '', tracks: ['one', 'two'].map((id) => ({ spotifyId: id, title: id, artistName: id, imageURL: '', albumName: '', duration_ms: 60000 })),
  clips: [ { id: 'a', trackId: 'one', sourceStartMs: 10000, sourceEndMs: 20000, volume: 1 },
    { id: 'b', trackId: 'two', sourceStartMs: 0, sourceEndMs: 5000, volume: 1 } ] };
beforeEach(() => {
  jest.clearAllMocks(); mockProps = undefined; mockEditorProps = undefined; mockSourceId = null; mockDirty = false;
  jest.mocked(getMixProject).mockResolvedValue(project);
  jest.mocked(downloadMixSources).mockResolvedValue(undefined);
  jest.mocked(renderMixAudio).mockResolvedValue({ uri: 'file:///mix.m4a', durationMs: 15000 });
});
it('locks the collection scrolling during timeline gestures and unlocks after release', async () => {
  await render(<MixDetail mixId={project.id} />);
  await waitFor(() => expect(mockProps.beforeTracks).toBeTruthy());
  await act(async () => mockEditorProps.onGestureActive(true));
  expect(mockProps.lockScroll).toBe(true);
  await act(async () => mockEditorProps.onGestureActive(false));
  expect(mockProps.lockScroll).toBe(false);
});
it('does not play an outdated mix if autosave fails', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    await render(<MixDetail mixId={project.id} />);
    await waitFor(() => expect(mockProps.beforeTracks).toBeTruthy());
    mockDirty = true;
    await act(async () => { await mockProps.onPlayMix(); });
    expect(mockPlay).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Mix', expect.stringContaining('Não foi possível salvar'));
  } finally { alert.mockRestore(); }
});
it.each([true, false])('pauses only this mix when closing the editor (same source: %s)', async (sameSource) => {
  await render(<MixDetail mixId={project.id} />);
  await waitFor(() => expect(mockProps?.title).toBe('Treino'));
  expect(mockProps.beforeTracks).toBeTruthy();
  await act(async () => { mockProps.onOpenMixEditor(); });
  expect(mockProps.beforeTracks).toBeUndefined();
  mockSourceId = sameSource ? 'playlist:local_mix_flow:revision:2' : 'playlist:another';
  await act(async () => { mockProps.onOpenMixEditor(); });
  expect(mockProps.beforeTracks).toBeTruthy();
  if (sameSource) expect(mockPause).toHaveBeenCalledWith('mix-editor-open');
  await act(async () => { mockEditorProps.onClose(); });
  if (sameSource) {
    expect(mockPause).toHaveBeenCalledWith('mix-editor-close');
    await waitFor(() => expect(mockSetState).toHaveBeenCalledTimes(1));
  } else {
    expect(mockPause).not.toHaveBeenCalled();
    expect(mockSetState).not.toHaveBeenCalled();
  }
});
it('composes and plays the saved edits locally without losing a request when downloads refresh the library', async () => {
  await render(<MixDetail mixId={project.id} />);
  await waitFor(() => expect(mockProps?.title).toBe('Treino'));
  let finish!: () => void;
  jest.mocked(downloadMixSources).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  let playback!: Promise<void>;
  await act(async () => { playback = mockProps.onPlayMix(); });
  await act(async () => { useLibraryStore.getState().refreshLibrary(); });
  await waitFor(() => expect(getMixProject).toHaveBeenCalledTimes(3));
  await act(async () => { finish(); await playback; });
  expect(renderMixAudio).toHaveBeenCalledWith(project);
  expect(mockPlay).toHaveBeenCalledWith([expect.objectContaining({ localOnly: true, localAudioPath: 'file:///mix.m4a', duration_ms: 15000 })], 0,
    'playlist:local_mix_flow:revision:2');
  expect(mockSeek).not.toHaveBeenCalled();
  expect(mockProps.playbackSourceId).toBe('playlist:local_mix_flow:revision:2');
});
it('plays the original full-length song when a source row is tapped, never the rendered mix', async () => {
  await render(<MixDetail mixId={project.id} />);
  await waitFor(() => expect(mockProps?.title).toBe('Treino'));
  await act(async () => { await mockProps.onPlayMix('two'); });
  expect(mockPlay).toHaveBeenCalledWith([expect.objectContaining({ spotifyId: 'two', duration_ms: 60000, title: 'two' })], 0, 'mix-source:local_mix_flow:two');
  expect(renderMixAudio).not.toHaveBeenCalled();
  expect(mockSeek).not.toHaveBeenCalled();
});
