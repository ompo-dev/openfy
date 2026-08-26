import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { PlaylistTrackPickerModal } from '../PlaylistTrackPickerModal';

jest.mock('../../native', () => {
  const mockReact = require('react');
  const { Pressable: MockPressable, View: MockView } = require('react-native');

  return {
    SheetFrame: ({ children }: { children: React.ReactNode }) =>
      mockReact.createElement(MockView, null, children),
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
    await fireEvent.press(screen.getByLabelText('Selecionar Segunda música'));
    await fireEvent.press(screen.getByLabelText('Adicionar 1 música'));

    expect(onConfirm).toHaveBeenCalledWith(['second']);
  });
});
