import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
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
  SheetFrame: ({ visible, title, children, headerTrailing }: {
    visible: boolean;
    title: string;
    children: React.ReactNode;
    headerTrailing?: React.ReactNode;
  }) => {
    if (!visible) return null;
    const mockReact = jest.requireActual<typeof import('react')>('react');
    const { Text: MockText, View: MockView } = jest.requireActual<
      typeof import('react-native')
    >('react-native');
    return mockReact.createElement(
      MockView,
      null,
      mockReact.createElement(MockText, null, title),
      headerTrailing,
      children
    );
  },
}));

const useDownloadsMock = useDownloads as jest.Mock;
const formatDownloadDiagnosticsMock = formatDownloadDiagnostics as jest.Mock;

describe('DownloadsModal', () => {
  beforeEach(() => {
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
      cancelDownload: jest.fn(),
      retryDownload: jest.fn(),
    });
    formatDownloadDiagnosticsMock.mockResolvedValue('{\n  "phase": "audio.failed"\n}');
    (Clipboard.setStringAsync as jest.Mock).mockClear();
  });

  it('opens and copies local diagnostics for a download', async () => {
    const screen = await render(<DownloadsModal visible onClose={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Ver logs de Faixa' }));
      await Promise.resolve();
    });

    expect(formatDownloadDiagnosticsMock).toHaveBeenCalledWith('track_1');
    expect(screen.getByText(/"phase": "audio\.failed"/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copiar logs' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      '{\n  "phase": "audio.failed"\n}'
    );
  });
});
