import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { PlaylistTrackPickerModal } from '../PlaylistTrackPickerModal';

jest.mock('../../native', () => {
  const { Pressable: MockPressable, View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    LoggedPressable: MockPressable,
    GlassSurface: MockView,
    SheetFrame: jest.requireActual('../../native/SheetFrame').SheetFrame,
  };
});

const tracks = [
  {
    spotifyId: 'first',
    title: 'Primeira música',
    artistName: 'Artista',
    albumName: 'Álbum',
    imageURL: '',
    localImagePath: '',
    duration_ms: 180000,
  },
  {
    spotifyId: 'second',
    title: 'Segunda música',
    artistName: 'Outro artista',
    albumName: 'Álbum',
    imageURL: '',
    localImagePath: '',
    duration_ms: 180000,
  },
];

describe('PlaylistTrackPickerModal', () => {
  it('adds selected downloaded tracks without offering duplicates', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <PlaylistTrackPickerModal
        existingTrackIds={['first']}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        tracks={tracks as any}
        visible
      />
    );

    expect(screen.getByText('Já está na playlist')).toBeTruthy();
    expect(screen.queryByText('Biblioteca')).toBeNull();
    expect(screen.getByText('Buscar')).toBeTruthy();
    expect(screen.queryByTestId('gym-sheet-custom-content')).toBeNull();
    await fireEvent.scroll(screen.getByTestId('playlist-track-picker-list'), { nativeEvent: { contentOffset: { y: 40, x: 0 } } });
    expect(screen.getByTestId('gym-sheet-header-glass')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Selecionar Segunda música'));
    await fireEvent.press(screen.getByLabelText('Adicionar 1 música'));

    expect(onConfirm).toHaveBeenCalledWith(['second']);
  });
});
