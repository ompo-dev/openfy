import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  initializeDownloadStore,
  useDownloadStore,
  type DownloadJob,
  type DownloadJobStatus,
} from '../stores/useDownloadStore';
import { log } from '../utils/appLogger';

export type { DownloadJob, DownloadJobStatus };

export const DownloadProvider = ({ children }: { children: React.ReactNode }) => {
  React.useEffect(() => {
    void initializeDownloadStore().catch((error: unknown) => {
      log.error('download store initialization failed', { error: String(error) });
    });
  }, []);

  return <>{children}</>;
};

export const useDownloads = () =>
  useDownloadStore(useShallow((state) => ({
    downloads: state.downloads,
    activeDownloadsCount: state.activeDownloadsCount,
    enqueueDownloads: state.enqueueDownloads,
    cancelDownload: state.cancelDownload,
    clearCompletedDownloads: state.clearCompletedDownloads,
    retryDownload: state.retryDownload,
    refreshDownloads: state.refreshDownloads,
  })));
