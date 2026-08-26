import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { useDownloads } from '@context';
import { DownloadsModal } from '../DownloadsModal';

jest.mock('@context', () => ({
  useDownloads: jest.fn(),
}));

jest.mock('../../native', () => {
  const mockReact = require('react');
  const { Pressable: MockPressable, View: MockView } = require('react-native');

  return {
    SheetFrame: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) =>
      mockReact.createElement(
        MockView,
        null,
        mockReact.createElement(MockPressable, {
          accessibilityLabel: 'Fechar downloads',
          onPress: onClose,
        }),
        children
      ),
  };
});

const mockedUseDownloads = useDownloads as jest.Mock;

const failedDownload = {
  spotifyId: 'failed-track',
  title: 'Faixa com falha',
  artistName: 'Artista',
  albumName: 'Álbum',
  imageURL: '',
  duration_ms: 180000,
  status: 'error' as const,
  progress: 0,
  queuedAt: '2026-01-01T00:00:00.000Z',
};

describe('DownloadsModal', () => {
  const cancelDownload = jest.fn();
  const clearCompletedDownloads = jest.fn();
  const retryDownload = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseDownloads.mockReturnValue({
      activeDownloadsCount: 0,
      cancelDownload,
      clearCompletedDownloads,
      downloads: [
        failedDownload,
        { ...failedDownload, spotifyId: 'completed-track', status: 'completed' as const },
      ],
      retryDownload,
    });
  });

  it('clears viewed completed jobs when closing', async () => {
    const screen = await render(<DownloadsModal visible onClose={onClose} />);

    await fireEvent.press(screen.getByLabelText('Fechar downloads'));

    expect(clearCompletedDownloads).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers retry and delete actions for failed jobs', async () => {
    const screen = await render(<DownloadsModal visible onClose={onClose} />);

    await fireEvent.press(
      screen.getByLabelText('Tentar baixar Faixa com falha novamente')
    );
    await fireEvent.press(
      screen.getByLabelText('Excluir download de Faixa com falha')
    );

    expect(retryDownload).toHaveBeenCalledWith('failed-track');
    expect(cancelDownload).toHaveBeenCalledWith('failed-track');
  });
});
