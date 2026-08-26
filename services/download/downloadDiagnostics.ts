import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { DownloadTrackInput } from './downloadManager';

const STORAGE_KEY = 'openfy_download_diagnostics_v1';
const TRACK_CAPACITY = 24;
const EVENT_CAPACITY = 80;

export type DownloadDiagnosticEvent = {
  at: string;
  phase: string;
  details?: Record<string, unknown>;
};

export type DownloadDiagnostic = {
  track: Pick<DownloadTrackInput, 'spotifyId' | 'title' | 'artistName' | 'albumName'>;
  platform: string;
  attempts: number;
  updatedAt: string;
  events: DownloadDiagnosticEvent[];
};

type DiagnosticStore = Record<string, DownloadDiagnostic>;

const diagnostics: DiagnosticStore = {};
let hydrated = false;
let hydration: Promise<void> | null = null;
let persistQueue = Promise.resolve();

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Keeps host and query names, never signed stream values, OAuth values or tokens. */
export const redactDownloadUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const keys = Array.from(new Set(Array.from(url.searchParams.keys())));
    return `${url.origin}${url.pathname}${
      keys.length ? `?${keys.map((key) => `${key}=…`).join('&')}` : ''
    }`;
  } catch {
    return 'invalid-url';
  }
};

const redactUrlsInText = (value: string) =>
  value.replace(/https?:\/\/[^\s'"<>]+/gi, (url) =>
    redactDownloadUrl(url) || 'invalid-url'
  );

const normalizeDetails = (details?: Record<string, unknown>) => {
  if (!details) return undefined;
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      typeof value === 'string' &&
      /(url|error|message)/i.test(key)
        ? key.toLowerCase().includes('url')
          ? redactDownloadUrl(value)
          : redactUrlsInText(value)
        : value instanceof Error
          ? redactUrlsInText(errorMessage(value))
          : value,
    ])
  );
};

const serialize = () => {
  const entries = Object.entries(diagnostics)
    .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, TRACK_CAPACITY);
  return Object.fromEntries(entries);
};

const persist = () => {
  persistQueue = persistQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serialize())))
    .catch(() => undefined);
  return persistQueue;
};

const hydrate = async () => {
  if (hydrated) return;
  if (!hydration) {
    hydration = AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as unknown;
        if (!parsed || typeof parsed !== 'object') return;
        Object.assign(diagnostics, parsed as DiagnosticStore);
      })
      .catch(() => undefined)
      .finally(() => {
        hydrated = true;
      });
  }
  await hydration;
};

export const startDownloadDiagnostics = async (track: DownloadTrackInput) => {
  await hydrate();
  const existing = diagnostics[track.spotifyId];
  const now = new Date().toISOString();
  diagnostics[track.spotifyId] = {
    track: {
      spotifyId: track.spotifyId,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
    },
    platform: Platform.OS,
    attempts: (existing?.attempts || 0) + 1,
    updatedAt: now,
    events: [
      ...(existing?.events || []),
      {
        at: now,
        phase: 'download.started',
        details: { platform: Platform.OS, attempt: (existing?.attempts || 0) + 1 },
      },
    ].slice(-EVENT_CAPACITY),
  };
  await persist();
};

export const recordDownloadDiagnostic = (
  spotifyId: string,
  phase: string,
  details?: Record<string, unknown>
) => {
  const existing = diagnostics[spotifyId];
  if (!existing) return;
  const now = new Date().toISOString();
  diagnostics[spotifyId] = {
    ...existing,
    updatedAt: now,
    events: [
      ...existing.events,
      { at: now, phase, details: normalizeDetails(details) },
    ].slice(-EVENT_CAPACITY),
  };
  void persist();
};

export const getDownloadDiagnostics = async (spotifyId: string) => {
  await hydrate();
  return diagnostics[spotifyId] || null;
};

export const formatDownloadDiagnostics = async (spotifyId: string) => {
  const diagnostic = await getDownloadDiagnostics(spotifyId);
  return JSON.stringify(
    diagnostic || { message: 'Nenhum log registrado para este download.' },
    null,
    2
  );
};

export const _resetDownloadDiagnosticsForTests = () => {
  Object.keys(diagnostics).forEach((key) => delete diagnostics[key]);
  hydrated = true;
  hydration = null;
};
