import * as React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MixEditorModal } from '../MixEditorModal';
import { saveMixProject } from '../../../services/mix/mixRepository';
import type { MixProject } from '../../../services/mix/mixTimeline';
const mockStop = jest.fn();
const mockPosition = jest.fn();
const mockHandleGestures = new Map<string, any>();
jest.mock('../useMixPreview', () => ({ useMixPreview: () => ({ stop: mockStop, play: jest.fn(), toggle: jest.fn(), position: 15000,
  playing: false, busy: false, error: '', setPosition: mockPosition }) }));
jest.mock('../../../services/mix/mixRepository', () => ({ saveMixProject: jest.fn() }));
jest.mock('../../../services/download/localAudioPaths', () => ({
  ...jest.requireActual('../../../services/download/localAudioPaths'),
  getExistingLocalAudioPath: jest.fn(async (path?: string) => path || null),
}));
jest.mock('../../../services/mix/mixWaveform', () => ({
  ...jest.requireActual('../../../services/mix/mixWaveform'),
  loadMixWaveform: jest.fn().mockResolvedValue([0.2, 0.8, 0.4, 0.6]),
}));
jest.mock('react-native-reorderable-list', () => ({ __esModule: true, default: jest.requireActual('react-native').FlatList,
  useReorderableDrag: () => jest.fn() }));
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children, gesture }: { children: React.ReactElement<any>; gesture: any }) => {
    if (children.props.accessibilityLabel?.startsWith('Arrastar ')) mockHandleGestures.set(children.props.accessibilityLabel, gesture);
    return children;
  },
}));
const project: MixProject = { version: 1, id: 'local_mix_edit', title: 'Treino', description: '', revision: 1,
  createdAt: '', updatedAt: '', tracks: [{ spotifyId: 'one', title: 'One', artistName: 'Artist', imageURL: '', albumName: '', duration_ms: 60000 }],
  clips: [{ id: 'clip', trackId: 'one', sourceStartMs: 1000, sourceEndMs: 31000, volume: 1 }] };
beforeEach(() => { jest.clearAllMocks(); mockHandleGestures.clear(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

it('splits, undoes, redoes and saves actual source cuts in the shared glass sheet', async () => {
  jest.mocked(saveMixProject).mockResolvedValue(project);
  const saved = jest.fn();
  const view = await render(<MixEditorModal project={project} visible onClose={jest.fn()} onSaved={saved} onAddTracks={jest.fn()} />);
  expect(view.queryByTestId('gym-sheet-custom-content')).toBeNull();
  expect(view.queryByTestId('gym-sheet-header-glass')).toBeNull();
  expect(view.getByTestId('mix-fixed-playhead')).toBeTruthy();
  expect(view.queryByLabelText('Aumentar zoom')).toBeNull();
  expect(view.queryByLabelText('Diminuir zoom')).toBeNull();
  await fireEvent.scroll(view.getByTestId('mix-editor-scroll'), { nativeEvent: { contentOffset: { y: 50 } } });
  expect(view.getByTestId('gym-sheet-header-glass')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  expect(view.getByLabelText('Selecionar clipe 2: One')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Desfazer'));
  expect(view.queryByLabelText('Selecionar clipe 2: One')).toBeNull();
  await fireEvent.press(view.getByLabelText('Refazer'));
  await fireEvent.press(view.getByLabelText('Salvar mix'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  const clips = jest.mocked(saveMixProject).mock.calls[0][1];
  expect(clips.map(({ sourceStartMs, sourceEndMs }) => [sourceStartMs, sourceEndMs])).toEqual([[1000, 16000], [16000, 31000]]);
  expect(saved).toHaveBeenCalledWith(project);
});
it('stops preview on the standard header close button', async () => {
  const close = jest.fn();
  const view = await render(<MixEditorModal project={project} visible onClose={close} onSaved={jest.fn()} onAddTracks={jest.fn()} />);
  mockStop.mockClear();
  await fireEvent.press(view.getByLabelText('Fechar'));
  expect(mockStop).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});
it('keeps unsaved edits while opening the source picker', async () => {
  const close = jest.fn();
  const add = jest.fn();
  const view = await render(<MixEditorModal project={project} visible onClose={close} onSaved={jest.fn()} onAddTracks={add} />);
  await fireEvent.press(view.getByLabelText('Remover clipe'));
  await fireEvent.press(view.getByLabelText('Adicionar música à faixa 1'));
  expect(add).not.toHaveBeenCalled();
  expect(view.getByLabelText('Buscar na biblioteca')).toBeTruthy();
  await fireEvent.press(view.getAllByLabelText('Fechar').at(-1)!);
  await fireEvent.press(view.getByLabelText('Fechar'));
  expect(close).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenLastCalledWith('Descartar alterações?', expect.any(String), expect.any(Array));
});

it('adds another music in a new lane without requiring a prior save', async () => {
  const library = [{ ...project.tracks[0], spotifyId: 'two', title: 'Two', duration_ms: 20000, isDownloaded: true, localAudioPath: 'file:///two.m4a' },
    { ...project.tracks[0], spotifyId: 'stream', title: 'Stream', isDownloaded: false }] as any;
  jest.mocked(saveMixProject).mockResolvedValue(project);
  const view = await render(<MixEditorModal project={project} library={library} visible onClose={jest.fn()} onSaved={jest.fn()} onAddTracks={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  await fireEvent.press(view.getByLabelText('Adicionar música à faixa 2'));
  expect(view.queryByLabelText('Selecionar Stream')).toBeNull();
  await fireEvent.press(view.getByLabelText('Selecionar Two'));
  await fireEvent.press(view.getByLabelText('Adicionar 1 música'));
  await waitFor(() => expect(view.getByLabelText('Selecionar clipe 3: Two')).toBeTruthy());
  expect(view.getByLabelText('Adicionar música à faixa 3')).toBeTruthy();
  expect(view.queryByText(/Clipes ·/)).toBeNull();
  expect(view.queryByLabelText('Nome do mix')).toBeNull();
  expect(view.queryByLabelText('Descrição do mix')).toBeNull();
  await fireEvent.press(view.getByLabelText('Salvar mix'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  const [saved, clips] = jest.mocked(saveMixProject).mock.calls[0];
  expect(saved.tracks.map((track) => track.spotifyId)).toEqual(['one', 'two']);
  expect(clips[2]).toMatchObject({ trackId: 'two', lane: 1, sourceEndMs: 20000 });
});

it('commits handle adjustments instead of snapping back', async () => {
  jest.mocked(saveMixProject).mockResolvedValue(project);
  const view = await render(<MixEditorModal project={project} visible onClose={jest.fn()} onSaved={jest.fn()} onAddTracks={jest.fn()} />);
  const handle = view.getByLabelText('Arrastar fim do clipe');
  await fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  await fireEvent.press(view.getByLabelText('Salvar mix'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls[0][1][0].sourceEndMs).toBe(30900);
});

it('retains the drag translation across timeline rerenders and commits on gesture release', async () => {
  jest.mocked(saveMixProject).mockResolvedValue(project);
  const view = await render(<MixEditorModal project={project} visible onClose={jest.fn()} onSaved={jest.fn()} onAddTracks={jest.fn()} />);
  const handle = mockHandleGestures.get('Arrastar fim do clipe');
  expect(handle).toBeDefined();
  await act(async () => { handle.handlers.onStart({ translationX: 0 }); });
  await act(async () => { handle.handlers.onUpdate({ translationX: -45 }); });
  await act(async () => { handle.handlers.onUpdate({ translationX: -90 }); });
  await act(async () => { handle.handlers.onEnd({ translationX: -90 }, true); handle.handlers.onFinalize({}, true); });
  await fireEvent.press(view.getByLabelText('Salvar mix'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls[0][1][0].sourceEndMs).toBe(29000);
});
it('uses the absolute finger location and preserves the last trim if another gesture cancels it', async () => {
  jest.mocked(saveMixProject).mockResolvedValue(project);
  const view = await render(<MixEditorModal project={project} visible onClose={jest.fn()} onSaved={jest.fn()} onAddTracks={jest.fn()} />);
  const handle = mockHandleGestures.get('Arrastar fim do clipe');
  await act(async () => { handle.handlers.onStart({ absoluteX: 200, translationX: 0 }); });
  await act(async () => { handle.handlers.onUpdate({ absoluteX: 110, translationX: 0 }); });
  await act(async () => { handle.handlers.onEnd({ absoluteX: 200, translationX: 0 }, false); handle.handlers.onFinalize({}, false); });
  await fireEvent.press(view.getByLabelText('Salvar mix'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls[0][1][0].sourceEndMs).toBe(29000);
});

it('shows artwork, real waveform, clip duration and explicit marker inside the timeline', async () => {
  const mix = { ...project, tracks: [{ ...project.tracks[0], explicit: true, imageURL: 'https://example.com/cover.jpg' }] };
  const library = [{ ...mix.tracks[0], isDownloaded: true, localAudioPath: 'file:///one.m4a', localImagePath: 'file:///cover.jpg' }] as any;
  const view = await render(<MixEditorModal project={mix} library={library} visible onClose={jest.fn()} onSaved={jest.fn()} onAddTracks={jest.fn()} />);
  expect(view.getAllByText('Artist • 0:30').length).toBeGreaterThan(0);
  expect(view.getByText('One ▪ E')).toBeTruthy();
  expect(view.getByTestId('mix-clip-cover')).toBeTruthy();
  await waitFor(() => expect(view.getByTestId('mix-clip-waveform')).toBeTruthy());
});
