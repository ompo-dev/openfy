import { create } from 'zustand';

import {
  cancelDownload as cancelPersistentDownload,
  downloadTrack,
  getPendingDownloads,
  notifyDownloadResult,
  queueDownloads,
  requestDownloadNotificationPermission,
  repairDownloadedTrackMetadata,
  type DownloadTrackInput,
} from '../services';
import { useLibraryStore } from './useLibraryStore';
import { executeCommand } from '../src/application/commandBus';
import { log } from '../utils/appLogger';
import { Platform } from 'react-native';

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

type DownloadState = {
  downloads: DownloadJob[];
  activeDownloadsCount: number;
  enqueueDownloads: (tracks: DownloadTrackInput[]) => void;
  cancelDownload: (spotifyId: string) => Promise<void>;
  clearCompletedDownloads: () => void;
  retryDownload: (spotifyId: string) => Promise<void>;
  refreshDownloads: () => Promise<void>;
};

const ACTIVE_STATUSES = new Set<DownloadJobStatus>(['queued', 'resolving', 'downloading']);
const activeRuns = new Map<string, Promise<boolean>>();
const cancelledIds = new Set<string>();
let refreshRequest: Promise<void> | null = null;
let initialization: Promise<void> | null = null;
let initialized = false;

const toQueuedJob = (track: DownloadTrackInput): DownloadJob => ({
  ...track,
  status: 'queued',
  progress: 0,
  queuedAt: new Date().toISOString(),
});

const mergeJobs = (existing: DownloadJob[], tracks: DownloadTrackInput[]) => {
  const present = new Set(existing.map((job) => job.spotifyId));
  return [
    ...existing,
    ...tracks.filter((track) => !present.has(track.spotifyId)).map(toQueuedJob),
  ];
};

const isActive = (job: DownloadJob) => ACTIVE_STATUSES.has(job.status);

const updateJob = (
  spotifyId: string,
  update: (job: DownloadJob) => DownloadJob
) => useDownloadStore.setState((state) => {
  const downloads = state.downloads.map((job) =>
    job.spotifyId === spotifyId ? update(job) : job
  );
  return { downloads, activeDownloadsCount: downloads.filter(isActive).length };
});

const runDownload = (
  track: DownloadTrackInput,
  audioUrl?: string,
  audioFormat = 'mp3'
): Promise<boolean> => {
  const active = activeRuns.get(track.spotifyId);
  if (active) return active;

  const request = executeCommand({
    name: 'download.track',
    category: 'download',
    idempotencyKey: track.spotifyId,
    successTtlMs: 1_500,
    isSuccess: Boolean,
    execute: async () => {
      cancelledIds.delete(track.spotifyId);
      updateJob(track.spotifyId, (job) => ({ ...job, status: 'resolving', progress: 0 }));
      try {
        const downloaded = await downloadTrack(
          track,
          audioUrl,
          audioFormat,
          (progress) => {
            if (cancelledIds.has(track.spotifyId)) return;
            updateJob(track.spotifyId, (job) => ({
              ...job,
              status: 'downloading',
              progress: Math.max(0, Math.min(1, progress)),
            }));
          }
        );

        if (!downloaded || cancelledIds.has(track.spotifyId)) {
          if (!cancelledIds.has(track.spotifyId)) {
            updateJob(track.spotifyId, (job) => ({ ...job, status: 'error', progress: 0 }));
          }
          return false;
        }

        updateJob(track.spotifyId, (job) => ({
          ...job,
          imageURL: downloaded.imageURL || job.imageURL,
          status: 'completed',
          progress: 1,
        }));
        useLibraryStore.getState().refreshLibrary();
        return true;
      } catch (error) {
        if (!cancelledIds.has(track.spotifyId)) {
          updateJob(track.spotifyId, (job) => ({ ...job, status: 'error', progress: 0 }));
        }
        log.error('download command failed', {
          trackId: track.spotifyId,
          error: String(error),
        });
        return false;
      }
    },
  }).finally(() => {
    activeRuns.delete(track.spotifyId);
    cancelledIds.delete(track.spotifyId);
  });
  activeRuns.set(track.spotifyId, request);
  return request;
};

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: [],
  activeDownloadsCount: 0,
  refreshDownloads: () => {
    if (refreshRequest) return refreshRequest;
    const finish = log.time('download', 'pending download state refresh');
    refreshRequest = getPendingDownloads()
      .then((pending) => {
        set((state) => {
          const currentById = new Map(
            state.downloads.map((job) => [job.spotifyId, job] as const)
          );
          const pendingJobs = pending.map(({ track, queuedAt }) => {
            const currentJob = currentById.get(track.spotifyId);
            return {
              ...track,
              status: currentJob?.status ?? 'queued',
              progress: currentJob?.progress ?? 0,
              queuedAt,
            } satisfies DownloadJob;
          });
          const pendingIds = new Set(pendingJobs.map((job) => job.spotifyId));
          const completed = state.downloads.filter(
            (job) => job.status === 'completed' && !pendingIds.has(job.spotifyId)
          );
          const downloads = [...completed, ...pendingJobs];
          return {
            downloads,
            activeDownloadsCount: downloads.filter(isActive).length,
          };
        });
        finish({ ok: true, pending: pending.length });
      })
      .catch((error: unknown) => {
        finish({ ok: false, error: String(error) });
        throw error;
      })
      .finally(() => {
        refreshRequest = null;
      });
    return refreshRequest;
  },
  enqueueDownloads: (tracks) => {
    const byId = new Map<string, DownloadTrackInput>();
    tracks.forEach((track) => {
      if (track.spotifyId && !byId.has(track.spotifyId)) byId.set(track.spotifyId, track);
    });
    const existing = new Set(
      get().downloads
        .filter((job) => isActive(job) || job.status === 'completed')
        .map((job) => job.spotifyId)
    );
    const additions = [...byId.values()].filter((track) => !existing.has(track.spotifyId));
    if (!additions.length) {
      log.download('enqueue ignored; tracks already queued or downloaded', {
        requested: byId.size,
      });
      return;
    }

    set((state) => {
      const downloads = mergeJobs(state.downloads, additions);
      return { downloads, activeDownloadsCount: downloads.filter(isActive).length };
    });
    const ids = additions.map((track) => track.spotifyId).sort();
    void executeCommand({
      name: 'download.enqueue',
      category: 'download',
      idempotencyKey: ids.join(','),
      successTtlMs: 1_000,
      execute: async () => {
        try {
          void requestDownloadNotificationPermission().catch(() => {});
          await queueDownloads(additions);
          let completed = 0;
          let failed = 0;
          for (let index = 0; index < additions.length; index += 3) {
            const results = await Promise.all(
              additions.slice(index, index + 3).map((track) =>
                runDownload(track, track.audioUrl, track.audioFormat || 'mp3')
              )
            );
            completed += results.filter(Boolean).length;
            failed += results.filter((result) => !result).length;
          }
          await notifyDownloadResult(completed, failed);
          return { completed, failed };
        } catch (error) {
          log.error('download queue command failed', { error: String(error) });
          const queuedIds = new Set(ids);
          set((state) => {
            const downloads = state.downloads.map((job) =>
              queuedIds.has(job.spotifyId)
                ? { ...job, status: 'error' as const, progress: 0 }
                : job
            );
            return { downloads, activeDownloadsCount: downloads.filter(isActive).length };
          });
          throw error;
        }
      },
    }).catch(() => {});
  },
  cancelDownload: async (spotifyId) => {
    await executeCommand({
      name: 'download.cancel',
      category: 'download',
      idempotencyKey: spotifyId,
      execute: async () => {
        cancelledIds.add(spotifyId);
        set((state) => {
          const downloads = state.downloads.filter((job) => job.spotifyId !== spotifyId);
          return { downloads, activeDownloadsCount: downloads.filter(isActive).length };
        });
        await cancelPersistentDownload(spotifyId);
      },
    });
  },
  clearCompletedDownloads: () => set((state) => {
    const downloads = state.downloads.filter((job) => job.status !== 'completed');
    log.download('completed download jobs cleared', {
      removed: state.downloads.length - downloads.length,
    });
    return { downloads, activeDownloadsCount: downloads.filter(isActive).length };
  }),
  retryDownload: async (spotifyId) => {
    const job = get().downloads.find((candidate) => candidate.spotifyId === spotifyId);
    if (!job || isActive(job) || job.status === 'completed') return;
    await executeCommand({
      name: 'download.retry',
      category: 'download',
      idempotencyKey: spotifyId,
      execute: async () => {
        updateJob(spotifyId, (current) => ({ ...current, status: 'queued', progress: 0 }));
        await queueDownloads([job]);
        const completed = await runDownload(job, job.audioUrl, job.audioFormat || 'mp3');
        if (!completed) throw new Error('O download não foi concluído.');
      },
    });
  },
}));

export const initializeDownloadStore = () => {
  if (initialized) return Promise.resolve();
  if (initialization) return initialization;
  initialization = (async () => {
    await useDownloadStore.getState().refreshDownloads();
    const refreshLibrary = useLibraryStore.getState().refreshLibrary;
    void repairDownloadedTrackMetadata(() => {
      setTimeout(refreshLibrary, 200);
    })
      .catch((error: unknown) => {
        log.error('download metadata repair failed', { error: String(error) });
      })
      .finally(refreshLibrary);

    if (Platform.OS !== 'web') {
      const pending = await getPendingDownloads();
      const resumable = pending.slice(0, 3);
      if (resumable.length) {
        useDownloadStore.setState((state) => {
          const downloads = mergeJobs(state.downloads, resumable.map(({ track }) => track));
          return { downloads, activeDownloadsCount: downloads.filter(isActive).length };
        });
        void Promise.all(resumable.map(({ track, audioUrl, audioFormat }) =>
          runDownload(track, audioUrl, audioFormat)
        )).catch((error: unknown) => {
          log.error('pending download resume failed', { error: String(error) });
        });
      }
    }
    initialized = true;
  })().finally(() => {
    initialization = null;
  });
  return initialization;
};

export const _resetDownloadStoreForTests = () => {
  activeRuns.clear();
  cancelledIds.clear();
  refreshRequest = null;
  initialization = null;
  initialized = false;
  useDownloadStore.setState({ downloads: [], activeDownloadsCount: 0 });
};
