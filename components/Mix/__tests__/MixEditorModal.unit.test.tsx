import * as React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { MixEditor, type MixEditorHandle } from '../MixEditorModal';
import { INITIAL_MIX_ZOOM, timelineScale } from '../MixTimelineEditor';
import { saveMixProject } from '../../../services/mix/mixRepository';
import { loadMixRhythm } from '../../../services/mix/mixWaveform';
import type { MixProject } from '../../../services/mix/mixTimeline';
const mockStop = jest.fn();
const mockPosition = jest.fn();
const mockToggle = jest.fn();
let mockBusy = false;
const mockHandleGestures = new Map<string, any>();
jest.mock('../useMixPreview', () => ({ useMixPreview: () => ({ stop: mockStop, play: jest.fn(), toggle: mockToggle, position: 15000,
  playing: false, busy: mockBusy, error: '', setPosition: mockPosition }) }));
jest.mock('../../../services/mix/mixRepository', () => ({ saveMixProject: jest.fn() }));
jest.mock('../../../services/download/localAudioPaths', () => ({
  ...jest.requireActual('../../../services/download/localAudioPaths'),
  getExistingLocalAudioPath: jest.fn(async (path?: string) => path || null),
}));
jest.mock('../../../services/mix/mixWaveform', () => ({
  ...jest.requireActual('../../../services/mix/mixWaveform'),
  loadMixWaveform: jest.fn().mockResolvedValue([0.2, 0.8, 0.4, 0.6]),
  loadMixRhythm: jest.fn().mockResolvedValue(null),
}));
jest.mock('react-native-reorderable-list', () => ({ __esModule: true, default: jest.requireActual('react-native').FlatList,
  useReorderableDrag: () => jest.fn() }));
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children, gesture }: { children: React.ReactElement<any>; gesture: any }) => {
    if (children.props.accessibilityLabel?.startsWith('Arrastar ')) mockHandleGestures.set(children.props.accessibilityLabel, gesture);
    if (children.props.testID?.startsWith('mix-drag-')) mockHandleGestures.set(children.props.testID, gesture);
    if (children.props.testID === 'mix-slip-lane') mockHandleGestures.set(children.props.testID, gesture);
    return children;
  },
}));
const project: MixProject = { version: 1, id: 'local_mix_edit', title: 'Treino', description: '', revision: 1,
  createdAt: '', updatedAt: '', tracks: [{ spotifyId: 'one', title: 'One', artistName: 'Artist', imageURL: '', albumName: '', duration_ms: 60000 }],
  clips: [{ id: 'clip', trackId: 'one', sourceStartMs: 1000, sourceEndMs: 31000, volume: 1 }] };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(saveMixProject).mockImplementation(async (base, clips) => ({ ...base, revision: base.revision + 1, clips })); mockBusy = false; mockHandleGestures.clear(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

it('extends every lane to the left and independently toggles preview mute without saving edits', async () => {
  const mix = { ...project, clips: [...project.clips, { ...project.clips[0], id: 'second', lane: 1 }] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.getByTestId('mix-lane-0')).toHaveStyle({ left: 0, right: 0 });
  expect(view.getByTestId('mix-lane-1')).toHaveStyle({ left: 0, right: 0 });
  await fireEvent.press(view.getByLabelText('Mutar faixa 1'));
  expect(view.getByLabelText('Ativar faixa 1')).toBeTruthy();
  expect(view.getByLabelText('Mutar faixa 2')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Ativar faixa 1'));
  expect(view.getByLabelText('Mutar faixa 1')).toBeTruthy();
  expect(saveMixProject).not.toHaveBeenCalled();
});
it('shows yellow modification indicators for any selected clip and updates on deselection and undo', async () => {
  const full = { ...project.clips[0], sourceStartMs: 0, sourceEndMs: 60000 };
  const mix = { ...project, clips: [full, { ...project.clips[0], id: 'second', lane: 1, volume: 0.6, beatsMs: [2000] }] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.queryByTestId('mix-tool-indicator-Volume')).toBeNull();
  expect(view.queryByTestId('mix-tool-indicator-Batidas')).toBeNull();
  await fireEvent.press(view.getByLabelText('Seleção múltipla'));
  await fireEvent.press(view.getByLabelText('Selecionar clipe 2: One'));
  for (const tool of ['Volume','Batidas','Deslizar']) expect(view.getByTestId(`mix-tool-indicator-${tool}`)).toHaveStyle({ backgroundColor: '#FFCF20' });
  await fireEvent.press(view.getByLabelText('Selecionar clipe 2: One'));
  expect(view.queryByTestId('mix-tool-indicator-Volume')).toBeNull();
  expect(view.queryByTestId('mix-tool-indicator-Batidas')).toBeNull();
  await fireEvent.press(view.getByLabelText('Volume do clipe'));
  await fireEvent(view.getByLabelText('Ajustar volume do clipe'), 'valueChange', 0.5);
  await fireEvent.press(view.getByLabelText('Aplicar volume'));
  expect(view.getByTestId('mix-tool-indicator-Volume')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Desfazer'));
  expect(view.queryByTestId('mix-tool-indicator-Volume')).toBeNull();
});

it('splits, undoes, redoes and saves actual source cuts inline without closing the editor', async () => {
  const saved = jest.fn();
  const close = jest.fn();
  const view = await render(<MixEditor project={project} onClose={close} onSaved={saved} />);
  expect(view.getByTestId('mix-inline-editor')).toBeTruthy();
  expect(view.queryByLabelText('Salvar mix')).toBeNull();
  expect(view.queryByLabelText('Fechar editor')).toBeNull();
  expect(within(view.getByTestId('mix-editor-panel')).getByTestId('mix-editor-toolbar')).toBeTruthy();
  expect(view.queryByTestId('gym-sheet-custom-content')).toBeNull();
  expect(view.queryByTestId('gym-sheet-header-glass')).toBeNull();
  expect(view.getByTestId('mix-fixed-playhead')).toBeTruthy();
  expect(view.queryByLabelText('Aumentar zoom')).toBeNull();
  expect(view.queryByLabelText('Diminuir zoom')).toBeNull();
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  expect(view.getByLabelText('Selecionar clipe 2: One')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Desfazer'));
  expect(view.queryByLabelText('Selecionar clipe 2: One')).toBeNull();
  await fireEvent.press(view.getByLabelText('Refazer'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  const clips = jest.mocked(saveMixProject).mock.calls.at(-1)![1];
  expect(clips.map(({ sourceStartMs, sourceEndMs }) => [sourceStartMs, sourceEndMs])).toEqual([[1000, 16000], [16000, 31000]]);
  expect(saved).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 4, clips }));
  expect(close).not.toHaveBeenCalled();
});
it('stops preview and flushes edits when the page collapses the editor', async () => {
  const close = jest.fn();
  const ref = React.createRef<MixEditorHandle>();
  await render(<MixEditor project={project} editorRef={ref} onClose={close} onSaved={jest.fn()} />);
  mockStop.mockClear();
  await act(async () => ref.current!.close());
  expect(mockStop).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});
it('preserves undo history and selection when the saved revision arrives', async () => {
  function Host() {
    const [mix, setMix] = React.useState(project);
    return <MixEditor project={mix} onClose={jest.fn()} onSaved={setMix} />;
  }
  const view = await render(<Host />);
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  await fireEvent.press(view.getByLabelText('Desfazer'));
  expect(view.queryByLabelText('Selecionar clipe 2: One')).toBeNull();
  await fireEvent.press(view.getByLabelText('Refazer'));
  expect(view.getByLabelText('Selecionar clipe 2: One')).toBeTruthy();
});
it('serializes rapid edits against successive persisted revisions without manual approval', async () => {
  let release!: () => void;
  jest.mocked(saveMixProject).mockImplementationOnce(async (base, clips) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return { ...base, revision: base.revision + 1, clips };
  });
  const ref = React.createRef<MixEditorHandle>();
  const view = await render(<MixEditor project={project} editorRef={ref} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  await fireEvent.press(view.getByLabelText('Desfazer'));
  await fireEvent.press(view.getByLabelText('Refazer'));
  expect(saveMixProject).toHaveBeenCalledTimes(1);
  expect(ref.current!.hasPendingEdits()).toBe(true);
  await act(async () => { release(); await ref.current!.flush(); });
  expect(jest.mocked(saveMixProject).mock.calls.map(([base]) => base.revision)).toEqual([1, 2, 3]);
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1]).toHaveLength(2);
  expect(ref.current!.hasPendingEdits()).toBe(false);
});
it('retains edits after a failed autosave and offers an explicit retry only on failure', async () => {
  jest.mocked(saveMixProject).mockRejectedValueOnce(new Error('Falha de armazenamento'));
  const ref = React.createRef<MixEditorHandle>();
  const view = await render(<MixEditor project={project} editorRef={ref} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  await waitFor(() => expect(view.getByLabelText('Tentar salvar novamente')).toBeTruthy());
  expect(view.getByLabelText('Selecionar clipe 2: One')).toBeTruthy();
  expect(await ref.current!.flush()).toBe(false);
  await fireEvent.press(view.getByLabelText('Tentar salvar novamente'));
  await waitFor(() => expect(view.queryByLabelText('Tentar salvar novamente')).toBeNull());
  expect(await ref.current!.flush()).toBe(true);
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1]).toHaveLength(2);
});
it('keeps preparation silent and exposes functional top-bar controls', async () => {
  mockBusy = true;
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.queryByText(/Preparando áudio/)).toBeNull();
  expect(view.getByLabelText('Parar prévia')).toBeTruthy();
  expect(view.getByTestId('mix-transport-time')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Adicionar batida no cursor'));
  await fireEvent.press(view.getByLabelText('Seleção múltipla'));
  await fireEvent.press(view.getByLabelText('Selecionar clipe 1: One'));
  expect(view.getByLabelText('Dividir no cursor')).toBeDisabled();
  await fireEvent.press(view.getByLabelText('Selecionar clipe 1: One'));
  await fireEvent.press(view.getByLabelText('Seleção múltipla'));
  expect(view.getByLabelText('Dividir no cursor')).toBeTruthy();
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0].beatsMs).toEqual([16000]);
});
it('selects several clips, changes only their requested effect and undoes the whole operation', async () => {
  const mix = { ...project, clips: [
    { ...project.clips[0], fadeInMs: 1000 },
    { ...project.clips[0], id: 'second', lane: 1, fadeOutMs: 3000 },
    { ...project.clips[0], id: 'third', lane: 2, volume: 0.3 },
  ] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Seleção múltipla'));
  await fireEvent.press(view.getByLabelText('Selecionar clipe 2: One'));
  expect(view.getByText('2 clipes selecionados')).toBeTruthy();
  expect(view.getByLabelText('Selecionar clipe 1: One').props.accessibilityState.selected).toBe(true);
  expect(view.getByLabelText('Selecionar clipe 2: One').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(view.getByLabelText('Volume do clipe'));
  await fireEvent(view.getByLabelText('Ajustar volume do clipe'), 'valueChange', 0.6);
  await fireEvent.press(view.getByLabelText('Aplicar volume'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalledTimes(1));
  expect(jest.mocked(saveMixProject).mock.calls[0][1]).toEqual([
    { ...mix.clips[0], volume: 0.6 }, { ...mix.clips[1], volume: 0.6 }, mix.clips[2],
  ]);
  await fireEvent.press(view.getByLabelText('Desfazer'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalledTimes(2));
  expect(jest.mocked(saveMixProject).mock.calls[1][1]).toEqual(mix.clips);
  await fireEvent.press(view.getByLabelText('Refazer'));
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalledTimes(4));
  expect(jest.mocked(saveMixProject).mock.calls[3][1]).toHaveLength(5);
});
it('slides the source waveform within a fixed 30-second window, previews the draft and commits only on apply', async () => {
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Deslizar clipe'));
  expect(view.getByTestId('mix-slip-window')).toBeTruthy();
  const gesture = mockHandleGestures.get('mix-slip-lane');
  await act(async () => { gesture.handlers.onStart({}); });
  await act(async () => { gesture.handlers.onUpdate({ translationX: -19000 * timelineScale(INITIAL_MIX_ZOOM, 30000) }); gesture.handlers.onFinalize({}); });
  expect(view.getByText('0:20 – 0:50 · 0:30')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Ouvir mix'));
  expect(mockToggle).toHaveBeenLastCalledWith(expect.objectContaining({ clips: [expect.objectContaining({ sourceStartMs: 20000, sourceEndMs: 50000 })] }), 15000, 'clip');
  await fireEvent.press(view.getByLabelText('Cancelar deslizar'));
  expect(view.queryByTestId('mix-slip-window')).toBeNull();
  await fireEvent.press(view.getByLabelText('Deslizar clipe'));
  await fireEvent(view.getByLabelText('Deslizar trecho de áudio'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  await fireEvent.press(view.getByLabelText('Aplicar deslizar'));
  await fireEvent.press(view.getByLabelText('Desfazer'));
  await fireEvent.press(view.getByLabelText('Refazer'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0]).toMatchObject({ sourceStartMs: 2000, sourceEndMs: 32000 });
});
it('copies, pastes and duplicates with distinct identities and preserves clip settings', async () => {
  const mix = { ...project, clips: [{ ...project.clips[0], volume: 0.7, fadeInMs: 1000, beatsMs: [5000] }] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Copiar clipe'));
  await fireEvent.press(view.getByLabelText('Colar clipe'));
  await fireEvent.press(view.getByLabelText('Duplicar clipe'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  const result = jest.mocked(saveMixProject).mock.calls.at(-1)![1];
  expect(result).toHaveLength(3);
  expect(new Set(result.map((clip) => clip.id)).size).toBe(3);
  expect(result.every((clip) => clip.volume === 0.7 && clip.fadeInMs === 1000 && clip.beatsMs?.[0] === 5000)).toBe(true);
});
it('replaces the selected source with one downloaded song, supports undo and retains the cut duration', async () => {
  const library = [{ ...project.tracks[0], spotifyId: 'two', title: 'Two', duration_ms: 90000, isDownloaded: true, localAudioPath: 'file:///two.m4a' },
    { ...project.tracks[0], spotifyId: 'three', title: 'Three', duration_ms: 90000, isDownloaded: true, localAudioPath: 'file:///three.m4a' },
    { ...project.tracks[0], spotifyId: 'remote', title: 'Remote', isDownloaded: false }] as any;
  const view = await render(<MixEditor project={project} library={library} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Substituir clipe'));
  expect(view.queryByLabelText('Selecionar Remote')).toBeNull();
  await fireEvent.changeText(view.getByLabelText('Buscar na biblioteca'), 'Three');
  await fireEvent.press(await view.findByLabelText('Selecionar Three'));
  await fireEvent.changeText(view.getByLabelText('Buscar na biblioteca'), 'Two');
  await fireEvent.press(await view.findByLabelText('Selecionar Two'));
  await fireEvent.changeText(view.getByLabelText('Buscar na biblioteca'), 'Three');
  expect(await view.findByLabelText('Selecionar Three')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Substituir música'));
  await waitFor(() => expect(view.getByLabelText('Selecionar clipe 1: Two')).toBeTruthy());
  await fireEvent.press(view.getByLabelText('Desfazer'));
  expect(view.getByLabelText('Selecionar clipe 1: One')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Refazer'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1]).toEqual([expect.objectContaining({ id: 'clip', trackId: 'two', sourceStartMs: 0, sourceEndMs: 30000 })]);
});
it('offers three audio tabs and commits the fade, reduction and volume in one edit', async () => {
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Volume do clipe'));
  await fireEvent(view.getByLabelText('Ajustar volume do clipe'), 'valueChange', 0.7);
  await fireEvent.press(view.getByLabelText('Redução automática'));
  await fireEvent(view.getByLabelText('Ajustar redução automática'), 'valueChange', 0.5);
  await fireEvent.press(view.getByLabelText('Esmaecer'));
  await fireEvent(view.getByLabelText('Ajustar aparecimento gradual'), 'valueChange', 1000);
  await fireEvent(view.getByLabelText('Ajustar desaparecimento gradual'), 'valueChange', 2000);
  await fireEvent.press(view.getByLabelText('Aplicar volume'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0]).toMatchObject({ volume: 0.7, duckAmount: 0.5, fadeInMs: 1000, fadeOutMs: 2000 });
});
it('adds and saves a manual beat at the source-relative cursor', async () => {
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Batidas do clipe'));
  expect(view.queryByLabelText('Posição da batida')).toBeNull();
  const transport = within(view.getByTestId('mix-beat-transport'));
  for (const label of ['Ouvir batidas','Desativado','Menos','Mais','Limpar batidas']) expect(transport.getByLabelText(label)).toBeTruthy();
  const wave = within(view.getByTestId('mix-beat-wave'));
  await fireEvent.press(wave.getByLabelText('Adicionar batida'));
  expect(wave.getByLabelText('Remover batida')).toBeTruthy();
  await fireEvent.press(wave.getByLabelText('Remover batida'));
  await fireEvent.press(wave.getByLabelText('Adicionar batida'));
  await fireEvent.press(view.getByLabelText('Aplicar batidas'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0].beatsMs).toEqual([16000]);
});
it('edits overlapping selected beats in one sheet, preserving distinct source offsets and the other clips', async () => {
  const mix = { ...project, clips: [
    project.clips[0],
    { ...project.clips[0], id: 'second', lane: 1, sourceStartMs: 5000, sourceEndMs: 35000 },
    { ...project.clips[0], id: 'third', lane: 2 },
  ] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.getByTestId('mix-editor-panel')).toHaveStyle({ backgroundColor: '#121212' });
  expect(view.getByTestId('mix-timeline-viewport')).toHaveStyle({ backgroundColor: '#121212' });
  await fireEvent.press(view.getByLabelText('Seleção múltipla'));
  await fireEvent.press(view.getByLabelText('Selecionar clipe 2: One'));
  await fireEvent.press(view.getByLabelText('Batidas do clipe'));
  expect(view.getByLabelText('Ver batidas do clipe 1: One')).toBeTruthy();
  expect(view.getByLabelText('Ver batidas do clipe 2: One')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Adicionar batida'));
  await fireEvent.press(view.getByLabelText('Ver batidas do clipe 1: One'));
  expect(view.getByTestId('mix-beat-dot-16000')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Aplicar batidas'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalledTimes(1));
  expect(jest.mocked(saveMixProject).mock.calls[0][1].map(clip => clip.beatsMs)).toEqual([[16000],[20000],undefined]);
  await fireEvent.press(view.getByLabelText('Desfazer'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalledTimes(2));
  expect(jest.mocked(saveMixProject).mock.calls[1][1]).toEqual(mix.clips);
});
it('shows the fade inside the clip and colors only passed beat dots yellow', async () => {
  const mix = { ...project, clips: [{ ...project.clips[0], fadeInMs: 15000, beatsMs: [14000, 18000] }] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(view.getAllByTestId('mix-fade-curve').length).toBeGreaterThan(0));
  expect(view.getByTestId('mix-beat-clip-14000')).toHaveStyle({ backgroundColor: '#FFCF20' });
  expect(view.getByTestId('mix-beat-clip-18000')).toHaveStyle({ backgroundColor: '#FFFFFF' });
  await fireEvent.press(view.getByLabelText('Batidas do clipe'));
  expect(view.getByTestId('mix-beat-dot-14000').props.fill).toBeDefined();
});
it('generates beats separately for every selected source and clears the whole group in one operation', async () => {
  const mix = { ...project, tracks: [...project.tracks, { ...project.tracks[0], spotifyId: 'two', title: 'Two' }],
    clips: [{ ...project.clips[0], beatsMs: [16000] }, { ...project.clips[0], id: 'second', trackId: 'two', lane: 1, beatsMs: [16000] }] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Seleção múltipla'));
  await fireEvent.press(view.getByLabelText('Selecionar clipe 2: Two'));
  await fireEvent.press(view.getByLabelText('Batidas do clipe'));
  await fireEvent.press(view.getByLabelText('Menos'));
  await waitFor(() => expect(view.getByLabelText('Menos').props.accessibilityState.selected).toBe(true));
  expect(loadMixRhythm).toHaveBeenCalledWith(undefined, 'one');
  expect(loadMixRhythm).toHaveBeenCalledWith(undefined, 'two');
  await fireEvent.press(view.getByLabelText('Limpar batidas'));
  await fireEvent.press(view.getByLabelText('Aplicar batidas'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalledTimes(1));
  expect(jest.mocked(saveMixProject).mock.calls[0][1].map(clip => clip.beatsMs)).toEqual([[],[]]);
});
it('automatically saves removal and keeps the editor accessible while opening the source picker', async () => {
  const close = jest.fn();
  const view = await render(<MixEditor project={project} onClose={close} onSaved={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Remover clipe'));
  await fireEvent.press(view.getByLabelText('Adicionar música à faixa 1'));
  expect(view.getByLabelText('Buscar na biblioteca')).toBeTruthy();
  await fireEvent.press(view.getAllByLabelText('Fechar').at(-1)!);
  expect(close).not.toHaveBeenCalled();
  await waitFor(() => expect(saveMixProject).toHaveBeenCalledWith(expect.anything(), []));
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('adds another music in a new lane without requiring a prior save', async () => {
  const library = [{ ...project.tracks[0], spotifyId: 'two', title: 'Two', duration_ms: 20000, isDownloaded: true, localAudioPath: 'file:///two.m4a' },
    { ...project.tracks[0], spotifyId: 'stream', title: 'Stream', isDownloaded: false }] as any;
  const view = await render(<MixEditor project={project} library={library} onClose={jest.fn()} onSaved={jest.fn()} />);
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
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  const [saved, clips] = jest.mocked(saveMixProject).mock.calls.at(-1)!;
  expect(saved.tracks.map((track) => track.spotifyId)).toEqual(['one', 'two']);
  expect(clips[2]).toMatchObject({ trackId: 'two', lane: 1, sourceEndMs: 20000 });
});

it('commits handle adjustments instead of snapping back', async () => {
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  const handle = view.getByLabelText('Arrastar fim do clipe');
  await fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0].sourceEndMs).toBe(30900);
});

it('retains the drag translation across timeline rerenders and commits on gesture release', async () => {
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  const handle = mockHandleGestures.get('Arrastar fim do clipe');
  expect(handle).toBeDefined();
  await act(async () => { handle.handlers.onStart({ translationX: 0 }); });
  const dx = -1000 * timelineScale(INITIAL_MIX_ZOOM, 30000);
  await act(async () => { handle.handlers.onUpdate({ translationX: dx }); });
  await act(async () => { handle.handlers.onUpdate({ translationX: dx * 2 }); });
  await act(async () => { handle.handlers.onEnd({ translationX: dx * 2 }, true); handle.handlers.onFinalize({}, true); });
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0].sourceEndMs).toBe(29000);
});
it('uses the absolute finger location and preserves the last trim if another gesture cancels it', async () => {
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  const handle = mockHandleGestures.get('Arrastar fim do clipe');
  await act(async () => { handle.handlers.onStart({ absoluteX: 200, translationX: 0 }); });
  await act(async () => { handle.handlers.onUpdate({ absoluteX: 200 - 2000 * timelineScale(INITIAL_MIX_ZOOM, 30000), translationX: 0 }); });
  await act(async () => { handle.handlers.onEnd({ absoluteX: 200, translationX: 0 }, false); handle.handlers.onFinalize({}, false); });
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0].sourceEndMs).toBe(29000);
});

it('shows artwork, real waveform, clip duration and explicit marker inside the timeline', async () => {
  const mix = { ...project, tracks: [{ ...project.tracks[0], explicit: true, imageURL: 'https://example.com/cover.jpg' }] };
  const library = [{ ...mix.tracks[0], isDownloaded: true, localAudioPath: 'file:///one.m4a', localImagePath: 'file:///cover.jpg' }] as any;
  const view = await render(<MixEditor project={mix} library={library} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.getAllByText('Artist • 0:30').length).toBeGreaterThan(0);
  expect(view.getByText('One ▪ E')).toBeTruthy();
  expect(view.getByTestId('mix-clip-cover')).toBeTruthy();
  await waitFor(() => expect(view.getByTestId('mix-clip-waveform')).toBeTruthy());
});

it('drags a clip horizontally and vertically, preserving its effects and allowing undo', async () => {
  const view = await render(<MixEditor project={project} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.queryByText(/Deslize para navegar/)).toBeNull();
  const gesture = mockHandleGestures.get('mix-drag-clip');
  const start = { absoluteX: 200, absoluteY: 100, translationX: 0, translationY: 0 };
  const dx = 2000 * timelineScale(INITIAL_MIX_ZOOM, 30000);
  const end = { absoluteX: 200 + dx, absoluteY: 146, translationX: dx, translationY: 46 };
  await act(async () => { gesture.handlers.onStart(start); });
  await act(async () => { gesture.handlers.onUpdate(end); });
  await act(async () => { gesture.handlers.onFinalize(end, true); });
  await fireEvent.press(view.getByLabelText('Desfazer'));
  await fireEvent.press(view.getByLabelText('Refazer'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1][0]).toMatchObject({
    id: 'clip', lane: 0, gapBeforeMs: 2000, sourceStartMs: 1000, sourceEndMs: 31000, volume: 1,
  });
});

it('compacts unused lanes, deselects on the background and switches between solo and full playback', async () => {
  const mix = { ...project, clips: [...project.clips, { ...project.clips[0], id: 'second', lane: 5 }] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.getByLabelText('Adicionar música à faixa 3')).toBeTruthy();
  expect(view.queryByLabelText('Adicionar música à faixa 4')).toBeNull();
  await fireEvent.press(view.getByLabelText('Ouvir mix'));
  expect(mockToggle).toHaveBeenLastCalledWith(expect.any(Object), 15000, 'clip');
  await fireEvent.press(view.getByLabelText('Desmarcar clipe'));
  expect(view.getByLabelText('Dividir no cursor')).toBeDisabled();
  await fireEvent.press(view.getByLabelText('Ouvir mix'));
  expect(mockToggle).toHaveBeenLastCalledWith(expect.any(Object), 15000, undefined);
});

it('drags an unfocused clip immediately and displays a magnetic edge guide', async () => {
  const mix = { ...project, clips: [...project.clips, { ...project.clips[0], id: 'second', lane: 1 }] };
  const view = await render(<MixEditor project={mix} onClose={jest.fn()} onSaved={jest.fn()} />);
  const gesture = mockHandleGestures.get('mix-drag-second');
  expect(gesture).toBeDefined();
  const start = { absoluteX: 100, absoluteY: 150, translationX: 0, translationY: 0 };
  const dx = 14960 * timelineScale(INITIAL_MIX_ZOOM, 30000);
  const end = { absoluteX: 100 + dx, absoluteY: 150, translationX: dx, translationY: 0 };
  await act(async () => { gesture.handlers.onStart(start); });
  await act(async () => { gesture.handlers.onUpdate(end); });
  expect(view.getByTestId('mix-snap-guide')).toBeTruthy();
  await act(async () => { gesture.handlers.onFinalize(end, true); });
  expect(view.queryByTestId('mix-snap-guide')).toBeNull();
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  expect(jest.mocked(saveMixProject).mock.calls.at(-1)![1].find((clip) => clip.id === 'second')).toMatchObject({ gapBeforeMs: 15000, lane: 1 });
});
