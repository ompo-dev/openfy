import * as React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { MixEditorModal } from '../MixEditorModal';
import { saveMixProject } from '../../../services/mix/mixRepository';
import type { MixProject } from '../../../services/mix/mixTimeline';
const mockStop = jest.fn();
const mockPosition = jest.fn();
jest.mock('../useMixPreview', () => ({ useMixPreview: () => ({ stop: mockStop, play: jest.fn(), position: 15000,
  playing: false, busy: false, error: '', setPosition: mockPosition }) }));
jest.mock('../../../services/mix/mixRepository', () => ({ saveMixProject: jest.fn() }));
jest.mock('react-native-reorderable-list', () => ({ __esModule: true, default: jest.requireActual('react-native').FlatList,
  useReorderableDrag: () => jest.fn() }));
const project: MixProject = { version: 1, id: 'local_mix_edit', title: 'Treino', description: '', revision: 1,
  createdAt: '', updatedAt: '', tracks: [{ spotifyId: 'one', title: 'One', artistName: 'Artist', imageURL: '', albumName: '', duration_ms: 60000 }],
  clips: [{ id: 'clip', trackId: 'one', sourceStartMs: 1000, sourceEndMs: 31000, volume: 1 }] };
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

it('splits, undoes, redoes and saves actual source cuts in the shared glass sheet', async () => {
  jest.mocked(saveMixProject).mockResolvedValue(project);
  const saved = jest.fn();
  const view = await render(<MixEditorModal project={project} visible onClose={jest.fn()} onSaved={saved} onAddTracks={jest.fn()} />);
  expect(view.queryByTestId('gym-sheet-custom-content')).toBeNull();
  await fireEvent.scroll(view.getByTestId('mix-editor-clips'), { nativeEvent: { contentOffset: { y: 50 } } });
  expect(view.getByTestId('gym-sheet-header-glass')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Dividir no cursor'));
  expect(view.getByText('Clipes · 2')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Desfazer'));
  expect(view.getByText('Clipes · 1')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Refazer'));
  await fireEvent.press(view.getByLabelText('Salvar mix'));
  await waitFor(() => expect(saveMixProject).toHaveBeenCalled());
  const clips = jest.mocked(saveMixProject).mock.calls[0][1];
  expect(clips.map(({ sourceStartMs, sourceEndMs }) => [sourceStartMs, sourceEndMs])).toEqual([[1000, 16000], [16000, 31000]]);
  expect(saved).toHaveBeenCalledWith(project);
});
it('does not lose unsaved edits when closing or adding another source', async () => {
  const close = jest.fn();
  const add = jest.fn();
  const view = await render(<MixEditorModal project={project} visible onClose={close} onSaved={jest.fn()} onAddTracks={add} />);
  await fireEvent.press(view.getByLabelText('Remover clipe'));
  await fireEvent.press(view.getByLabelText('Adicionar músicas ao mix'));
  expect(add).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText('Fechar'));
  expect(close).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenLastCalledWith('Descartar alterações?', expect.any(String), expect.any(Array));
});
