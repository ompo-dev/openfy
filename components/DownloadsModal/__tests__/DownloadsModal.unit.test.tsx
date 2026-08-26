import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { useDownloads } from '@context';
import { formatDownloadDiagnostics } from '@services';
import { DownloadsModal } from '../DownloadsModal';

jest.mock('@context', () => ({
  useDownloads: jest.fn(),
}));

jest.mock('@services', () => ({
  formatDownloadDiagnostics: jest.fn(),
}));

jest.mock('../../native', () => ({
  SheetFrame: ({ visible, title, children, headerLeading, headerTrailing, onClose }: {
    visible: boolean;
    title: string;
    children: React.ReactNode;
    headerLeading?: React.ReactNode;
    headerTrailing?: React.ReactNode;
    onClose: () => void;
  }) => {
    if (!visible) return null;
    const mockReact = jest.requireActual<typeof import('react')>('react');
    const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual<
      typeof import('react-native')
    >('react-native');
    return mockReact.createElement(
      MockView,
      null,
      mockReact.createElement(MockText, null, title),
      mockReact.createElement(
        MockPressable,
        { accessibilityLabel: 'Fechar downloads', onPress: onClose }
      ),
      headerLeading,
      headerTrailing,
      children
    );
  },
}));

const useDownloadsMock = useDownloads as jest.Mock;
const formatDownloadDiagnosticsMock = formatDownloadDiagnostics as jest.Mock;
const cancelDownload = jest.fn();
const clearCompletedDownloads = jest.fn();
const retryDownload = jest.fn();

describe('DownloadsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDownloadsMock.mockReturnValue({
      downloads: [
        {
          spotifyId: 'track_1',
          title: 'Faixa',
          artistName: 'Artista',
          albumName: 'Álbum',
          imageURL: '',
          duration_ms: 120000,
          status: 'error',
          progress: 0,
          queuedAt: '2026-08-23T00:00:00.000Z',
        },
      ],
      activeDownloadsCount: 0,
      cancelDownload,
      clearCompletedDownloads,
      retryDownload,
    });
    formatDownloadDiagnosticsMock.mockResolvedValue('{\n  "phase": "audio.failed"\n}');
    (Clipboard.setStringAsync as jest.Mock).mockClear();
  });

  it('opens and copies local diagnostics for a download', async () => {
    const screen = await render(<DownloadsModal visible onClose={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Ver logs de Faixa' }));

    expect(formatDownloadDiagnosticsMock).toHaveBeenCalledWith('track_1');
    expect(await screen.findByText(/"phase": "audio\.failed"/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Copiar logs' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      '{\n  "phase": "audio.failed"\n}'
    );
  });

  it('clears completed jobs on close and exposes retry plus delete for errors', async () => {
    const onClose = jest.fn();
    const screen = await render(<DownloadsModal visible onClose={onClose} />);

    fireEvent.press(screen.getByLabelText('Tentar baixar Faixa novamente'));
    fireEvent.press(screen.getByLabelText('Excluir download de Faixa'));
    fireEvent.press(screen.getByLabelText('Fechar downloads'));

    expect(retryDownload).toHaveBeenCalledWith('track_1');
    expect(cancelDownload).toHaveBeenCalledWith('track_1');
    expect(clearCompletedDownloads).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
