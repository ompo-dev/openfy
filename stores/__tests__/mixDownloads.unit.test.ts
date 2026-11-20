import { waitFor } from '@testing-library/react-native';
import { downloadTrack, getPendingDownloads, queueDownloads } from '../../services';
import { useDownloadStore, _resetDownloadStoreForTests, initializeDownloadStore } from '../useDownloadStore';
import { useConnectivityStore } from '../useConnectivityStore';
jest.mock('../../services', () => ({ downloadTrack: jest.fn(), queueDownloads: jest.fn().mockResolvedValue(undefined),
  getPendingDownloads: jest.fn().mockResolvedValue([]), notifyDownloadResult: jest.fn().mockResolvedValue(undefined),
  requestDownloadNotificationPermission: jest.fn().mockResolvedValue(undefined), repairDownloadedTrackMetadata: jest.fn().mockResolvedValue(undefined) }));
const track = (id: string) => ({ spotifyId: id, title: id, artistName: 'Artist', albumName: '', imageURL: '', duration_ms: 60000 });
beforeEach(() => {
  jest.clearAllMocks(); _resetDownloadStoreForTests();
  useConnectivityStore.getState().updateConnectivity(true);
  jest.mocked(getPendingDownloads).mockResolvedValue([]);
  jest.mocked(downloadTrack).mockImplementation(async (input) => ({ ...input, localAudioPath: `file:///${input.spotifyId}.m4a` }) as never);
});
it('persists every mix source offline and resumes all of them after reconnection', async () => {
  useConnectivityStore.getState().updateConnectivity(false);
  await initializeDownloadStore();
  const sources = Array.from({ length: 5 }, (_, index) => track(String(index)));
  await useDownloadStore.getState().ensureDownloads(sources);
  expect(queueDownloads).toHaveBeenCalledWith(sources);
  expect(downloadTrack).not.toHaveBeenCalled();
  jest.mocked(getPendingDownloads).mockResolvedValue(sources.map((source) => ({ track: source, queuedAt: '' })) as never);
  useConnectivityStore.getState().updateConnectivity(true);
  await waitFor(() => expect(downloadTrack).toHaveBeenCalledTimes(5));
  await waitFor(() => expect(useDownloadStore.getState().downloads.every((job) => job.status === 'completed')).toBe(true));
});
it('shares an active download between mix inclusions instead of downloading twice', async () => {
  let finish!: (value: any) => void;
  jest.mocked(downloadTrack).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const first = useDownloadStore.getState().ensureDownloads([track('shared')]);
  await waitFor(() => expect(downloadTrack).toHaveBeenCalledTimes(1));
  const second = useDownloadStore.getState().ensureDownloads([track('shared')]);
  finish(track('shared'));
  await Promise.all([first, second]);
  expect(downloadTrack).toHaveBeenCalledTimes(1);
});
it('keeps failed source downloads visible for retry', async () => {
  jest.mocked(downloadTrack).mockResolvedValue(null);
  await useDownloadStore.getState().ensureDownloads([track('missing')]);
  expect(useDownloadStore.getState().downloads[0].status).toBe('error');
});
