import * as React from 'react';

import {
  cancelDownload as cancelPersistentDownload,
  downloadTrack,
  getPendingDownloads,
  notifyDownloadResult,
  queueDownloads,
  requestDownloadNotificationPermission,
  type DownloadTrackInput,
} from '@services';

import { useLibrarySelectedCategory } from './LibrarySelectedCategoryContext';

export type DownloadJobStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'completed'
  | 'error';

export type DownloadJob = DownloadTrackInput & {
  status: DownloadJobStatus;
  progress: number;
  queuedAt: string;
};

type DownloadContextValue = {
  downloads: DownloadJob[];
  activeDownloadsCount: number;
  enqueueDownloads: (tracks: DownloadTrackInput[]) => void;
  cancelDownload: (spotifyId: string) => Promise<void>;
  refreshDownloads: () => Promise<void>;
};

const DownloadContext = React.createContext<DownloadContextValue | null>(null);

const activeStatus = (status: DownloadJobStatus) =>
  status === 'queued' || status === 'resolving' || status === 'downloading';

const toQueuedJob = (track: DownloadTrackInput): DownloadJob => ({
  ...track,
  status: 'queued',
  progress: 0,
  queuedAt: new Date().toISOString(),
});

const mergeJobs = (
  existing: DownloadJob[],
  tracks: DownloadTrackInput[]
): DownloadJob[] => {
  const additions = tracks.filter(
    (track) => !existing.some((job) => job.spotifyId === track.spotifyId)
  );
  return [...existing, ...additions.map(toQueuedJob)];
};

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const { refreshLibrary } = useLibrarySelectedCategory();
  const [downloads, setDownloads] = React.useState<DownloadJob[]>([]);
  const activeIds = React.useRef(new Set<string>());
  const cancelledIds = React.useRef(new Set<string>());

  const refreshDownloads = React.useCallback(async () => {
    const pending = await getPendingDownloads();
    setDownloads((current) => {
      const currentById = new Map(
        current.map((job) => [job.spotifyId, job] as const)
      );
      const pendingJobs = pending.map(({ track, queuedAt }) => {
        const currentJob = currentById.get(track.spotifyId);
        return {
          ...track,
          status: currentJob?.status ?? 'queued',
          progress: currentJob?.progress ?? 0,
          queuedAt,
        };
      });
      const pendingIds = new Set(pendingJobs.map((job) => job.spotifyId));
      const completed = current.filter(
        (job) => job.status === 'completed' && !pendingIds.has(job.spotifyId)
      );
      return [...completed, ...pendingJobs];
    });
  }, []);

  React.useEffect(() => {
    void refreshDownloads();
  }, [refreshDownloads]);

  const runDownload = React.useCallback(
    async (
      track: DownloadTrackInput,
      audioUrl?: string,
      audioFormat = 'mp3'
    ): Promise<boolean> => {
      if (activeIds.current.has(track.spotifyId)) return false;
      activeIds.current.add(track.spotifyId);
      setDownloads((current) =>
        current.map((job) =>
          job.spotifyId === track.spotifyId
            ? { ...job, status: 'resolving', progress: 0 }
            : job
        )
      );

      try {
        const downloaded = await downloadTrack(track, audioUrl, audioFormat, (progress) => {
          setDownloads((current) =>
            current.map((job) =>
              job.spotifyId === track.spotifyId
                ? { ...job, status: 'downloading', progress }
                : job
            )
          );
        });

        if (!downloaded) {
          if (!cancelledIds.current.has(track.spotifyId)) {
            setDownloads((current) =>
              current.map((job) =>
                job.spotifyId === track.spotifyId
                  ? { ...job, status: 'error', progress: 0 }
                  : job
              )
            );
          }
          return false;
        }

        setDownloads((current) =>
          current.map((job) =>
            job.spotifyId === track.spotifyId
              ? {
                  ...job,
                  imageURL: downloaded.imageURL || job.imageURL,
                  status: 'completed',
                  progress: 1,
                }
              : job
          )
        );
        refreshLibrary();
        return true;
      } finally {
        activeIds.current.delete(track.spotifyId);
        cancelledIds.current.delete(track.spotifyId);
      }
    },
    [refreshLibrary]
  );

  React.useEffect(() => {
    void (async () => {
      const pending = await getPendingDownloads();
      const downloadsToResume = pending.slice(0, 3);
      if (downloadsToResume.length === 0) return;
      setDownloads((current) =>
        mergeJobs(current, downloadsToResume.map((download) => download.track))
      );
      await Promise.all(
        downloadsToResume.map((download) =>
          runDownload(
            download.track,
            download.audioUrl,
            download.audioFormat
          )
        )
      );
    })();
  }, [runDownload]);

  const cancelDownload = React.useCallback(async (spotifyId: string) => {
    cancelledIds.current.add(spotifyId);
    setDownloads((current) =>
      current.filter((job) => job.spotifyId !== spotifyId)
    );
    await cancelPersistentDownload(spotifyId);
  }, []);

  const enqueueDownloads = React.useCallback(
    (tracks: DownloadTrackInput[]) => {
      const activeOrCompleted = new Set(
        downloads
          .filter((job) => activeStatus(job.status) || job.status === 'completed')
          .map((job) => job.spotifyId)
      );
      const uniqueTracks = tracks.filter(
        (track, index) =>
          tracks.findIndex(
            (candidate) => candidate.spotifyId === track.spotifyId
          ) === index && !activeOrCompleted.has(track.spotifyId)
      );
      if (uniqueTracks.length === 0) return;

      setDownloads((current) => mergeJobs(current, uniqueTracks));
      void (async () => {
        try {
          void requestDownloadNotificationPermission().catch(() => {});
          await queueDownloads(uniqueTracks);
          let completed = 0;
          let failed = 0;
          for (let index = 0; index < uniqueTracks.length; index += 3) {
            const results = await Promise.all(
              uniqueTracks
                .slice(index, index + 3)
                .map((track) =>
                  runDownload(
                    track,
                    track.audioUrl,
                    track.audioFormat || 'mp3'
                  )
                )
            );
            completed += results.filter(Boolean).length;
            failed += results.filter((result) => !result).length;
          }
          void notifyDownloadResult(completed, failed);
        } catch (error) {
          console.warn('[Downloads] Could not queue downloads:', error);
          const queuedIds = new Set(uniqueTracks.map((track) => track.spotifyId));
          setDownloads((current) =>
            current.map((job) =>
              queuedIds.has(job.spotifyId)
                ? { ...job, status: 'error', progress: 0 }
                : job
            )
          );
        }
      })();
    },
    [downloads, runDownload]
  );

  const activeDownloadsCount = downloads.filter((job) => activeStatus(job.status)).length;

  const value = React.useMemo(
    () => ({
      downloads,
      activeDownloadsCount,
      enqueueDownloads,
      cancelDownload,
      refreshDownloads,
    }),
    [activeDownloadsCount, cancelDownload, downloads, enqueueDownloads, refreshDownloads]
  );

  return (
    <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>
  );
}

export function useDownloads(): DownloadContextValue {
  const value = React.useContext(DownloadContext);
  if (!value) throw new Error('useDownloads must be used inside DownloadProvider');
  return value;
}
