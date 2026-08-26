/**
 * Audio Resolver Service
 * High-speed 100% Original Master Studio Track Resolver with Canonical Matching Engine.
 * Rejects remixes, covers, slowed/reverb, live versions, extended loops, and 30s snippets.
 * Prioritizes official artist channels, highest view/play counts, and closest song timing.
 */

import { Platform } from 'react-native';
import { LOCAL_AUDIO_ONLY, MUSIC_SERVER_URL } from '@config';
import { fetchWithTimeout as fetchWithHermesTimeout } from '@utils';
import {
  evaluateCandidateMatch,
  hasUnwantedForbiddenWords,
} from '../canonical/canonicalMatcher';
import { resolveDirectYouTubeAudio } from './directYouTubeResolver';

export type ResolvedAudio = {
  url: string;
  quality: string;
  format: string;
  source: 'spotyloader' | 'soundcloud' | 'youtube';
  confidence?: number;
  imageURL?: string;
};

type BackendResolveSource = {
  id?: string;
  streamUrl?: string;
  provider?: string;
  quality?: string;
  format?: string;
  score?: number;
};

type BackendResolvePayload = {
  source?: BackendResolveSource;
  playback?: BackendResolveSource & { directUrl?: string; url?: string };
  track?: { title?: string; imageURL?: string };
  artwork?: { url?: string };
};

type BackendResolveResponse = BackendResolvePayload & {
  data?: BackendResolvePayload;
  error?: { code?: string; message?: string };
};

const unwrapBackendResolvePayload = (
  response: BackendResolveResponse
): BackendResolvePayload => response.data || response;

const AUDIO_RESOLVE_TTL_MS = 8 * 60_000;
const WEB_BACKEND_TIMEOUT_MS = 120_000;
const resolvedAudioCache = new Map<
  string,
  { value: ResolvedAudio; expiresAt: number }
>();
const activeAudioResolves = new Map<string, Promise<ResolvedAudio | null>>();

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getAudioResolveKey = (
  trackName: string,
  artistName: string,
  spotifyId?: string,
  durationMs?: number,
  releaseDate?: string
) =>
  [
    spotifyId || '',
    trackName,
    artistName,
    durationMs || 0,
    releaseDate || '',
  ]
    .join('\u0000')
    .toLowerCase();

const isProxyableProviderUrl = (value: string) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === 'googlevideo.com' ||
      host.endsWith('.googlevideo.com') ||
      host === 'sndcdn.com' ||
      host.endsWith('.sndcdn.com') ||
      host === 'soundcloud.com' ||
      host.endsWith('.soundcloud.com')
    );
  } catch {
    return false;
  }
};

/**
 * Provider URLs are signed for the machine that resolved them. Route known
 * provider hosts through the same API server that created the URL so iOS,
 * Android and Web do not receive a Googlevideo 403 on download.
 */
export const getPlayableAudioUrl = (streamUrl: string): string =>
  (() => {
    try {
      const input = new URL(streamUrl);
      const proxiedSource =
        input.pathname === '/api/audio/proxy'
          ? input.searchParams.get('url') || ''
          : streamUrl;

      if (!isProxyableProviderUrl(proxiedSource)) return streamUrl;
      if (LOCAL_AUDIO_ONLY) return proxiedSource;
      if (!MUSIC_SERVER_URL) return proxiedSource;
      return /^https:\/\//i.test(proxiedSource)
        ? `${MUSIC_SERVER_URL}/api/audio/proxy?url=${encodeURIComponent(proxiedSource)}`
        : streamUrl;
    } catch {
      return streamUrl;
    }
  })();

const getRenewableYouTubeAudioUrl = (videoId?: string): string | null => {
  if (LOCAL_AUDIO_ONLY) return null;
  if (!MUSIC_SERVER_URL || !videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return null;
  }
  return `${MUSIC_SERVER_URL}/api/audio/youtube?videoId=${encodeURIComponent(videoId)}`;
};

const getYouTubeVideoIdFromTrackId = (trackId?: string): string | null => {
  const match = trackId?.match(/^yt_([A-Za-z0-9_-]{11})$/);
  return match?.[1] || null;
};

const resolveExactYouTubeVideo = async (
  videoId: string,
  fresh = false
): Promise<ResolvedAudio | null> => {
  const direct = await resolveDirectYouTubeAudio({ videoId, fresh });
  if (direct) {
    return {
      url: direct.url,
      quality: 'high',
      format: direct.format,
      source: 'youtube',
      confidence: 100,
      imageURL: direct.imageURL,
    };
  }

  if (LOCAL_AUDIO_ONLY) return null;

  if (MUSIC_SERVER_URL) {
    try {
      const response = await fetchWithHermesTimeout(
        `${MUSIC_SERVER_URL}/api/music/youtube`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
        },
        WEB_BACKEND_TIMEOUT_MS
      );
      const data = (await response.json().catch(() => ({}))) as {
        track?: { videoId?: string; streamUrl?: string; imageURL?: string; format?: string };
      };
      if (response.ok && data.track?.videoId === videoId && data.track.streamUrl) {
        return {
          url:
            getRenewableYouTubeAudioUrl(data.track.videoId) ||
            getPlayableAudioUrl(data.track.streamUrl),
          quality: 'high',
          format: data.track.format || 'm4a',
          source: 'youtube',
          confidence: 100,
          imageURL: data.track.imageURL,
        };
      }
      console.warn(
        `[AudioResolver] Exact YouTube backend returned HTTP ${response.status ?? 'unknown'}.`
      );
    } catch (error) {
      console.warn(
        `[AudioResolver] Exact YouTube backend failed at ${MUSIC_SERVER_URL}: ${errorMessage(error)}`
      );
    }
  }

  return null;
};

/**
 * Is URL a forbidden preview or 30-second snippet?
 */
export const isPreviewUrl = (url: string): boolean => {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('/0/30/') ||
    lower.includes('/0/29/') ||
    lower.includes('preview') ||
    lower.includes('snippet') ||
    lower.includes('short_preview')
  );
};

/**
 * Fetch with timeout and graceful web CORS handling
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = 7000
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Try direct fetch first
    try {
      const directRes = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (
        directRes.ok ||
        directRes.status === 304 ||
        directRes.status === 401
      ) {
        return directRes;
      }
    } catch (e: any) {
      if (Platform.OS !== 'web') throw e;
    }

    // 2. On Web: Fallback through public CORS proxies
    if (
      Platform.OS === 'web' &&
      !url.includes('localhost') &&
      !url.includes('127.0.0.1')
    ) {
      const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      ];

      for (const proxyUrl of proxies) {
        try {
          const proxyRes = await fetch(proxyUrl, {
            ...options,
            signal: controller.signal,
          });
          if (proxyRes.ok) return proxyRes;
        } catch {}
      }
    }

    // Final attempt
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

let cachedSoundCloudClientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';

/**
 * Refresh SoundCloud client ID dynamically if 401 occurs
 */
export const refreshSoundCloudClientId = async (): Promise<string> => {
  try {
    const pageRes = await fetchWithTimeout(
      'https://soundcloud.com',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      4000
    );

    if (pageRes.ok) {
      const html = await pageRes.text();
      const scriptUrls = [...html.matchAll(/src="(https:\/\/[^"]+\.js)"/g)].map(
        (m) => m[1]
      );

      for (const url of scriptUrls.slice(-6)) {
        const jsRes = await fetchWithTimeout(url, {}, 3000);
        if (jsRes.ok) {
          const jsText = await jsRes.text();
          const match =
            jsText.match(/client_id:"([a-zA-Z0-9]{32})"/i) ||
            jsText.match(/client_id=([a-zA-Z0-9]{32})/i) ||
            jsText.match(/"client_id"\s*:\s*"([a-zA-Z0-9]{32})"/i);
          if (match && match[1]) {
            cachedSoundCloudClientId = match[1];
            return cachedSoundCloudClientId;
          }
        }
      }
    }
  } catch {}

  return cachedSoundCloudClientId;
};

/**
 * YouTube Master Topic & Official Channel Ranker
 * Priority: Official Artist Channel / Topic -> Highest View Count -> Closest Song Timing
 */
export const resolveViaYouTubeTopic = async (
  trackName: string,
  artistName: string,
  expectedDurationMs?: number
): Promise<ResolvedAudio | null> => {
  const expectedSec =
    expectedDurationMs && expectedDurationMs > 0
      ? Math.round(expectedDurationMs / 1000)
      : 0;

  const primaryArtist = (artistName || '').split(',')[0].split('&')[0].trim();
  const query = primaryArtist
    ? `${primaryArtist} - ${trackName} Official Audio`
    : `${trackName} Official Audio`;

  const instances = [
    'https://invidious.flokinet.to',
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.drgns.space',
  ];

  for (const inst of instances) {
    try {
      const searchUrl = `${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const res = await fetchWithTimeout(searchUrl, {}, 4000);
      if (!res.ok) continue;

      const results = (await res.json()) as any[];
      if (!Array.isArray(results) || results.length === 0) continue;

      // Filter and score candidates
      const scoredCandidates: any[] = [];

      for (const video of results) {
        if (!video.videoId) continue;
        if (hasUnwantedForbiddenWords(video.title || '', trackName)) continue;

        const durSec = video.lengthSeconds || 0;
        const viewCount = video.viewCount || 0;
        const author = (video.author || '').toLowerCase();
        const title = (video.title || '').toLowerCase();

        const matchReport = evaluateCandidateMatch(
          {
            title: video.title || '',
            artist: video.author || '',
            durationMs: durSec * 1000,
            provider: 'youtube',
            url: `https://www.youtube.com/watch?v=${video.videoId}`,
            viewCount,
          },
          {
            title: trackName,
            artists: primaryArtist ? [primaryArtist] : [],
            durationMs: expectedDurationMs || 0,
            spotifyId: '',
          }
        );
        if (!matchReport.isVerified) continue;

        // Duration proximity filter
        const diffSec = expectedSec > 0 ? Math.abs(durSec - expectedSec) : 0;
        if (diffSec > 45 && expectedSec > 0) continue;

        let score = 0;

        // 1. High view count (more popular = official)
        if (viewCount > 0) {
          score += Math.min(1000, Math.log10(viewCount) * 100);
        }

        // 2. Official artist channel / topic channel (+800)
        const normAuthor = author.replace(/[^a-z0-9]/g, '');
        const normArtist = primaryArtist
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (
          normAuthor.includes(normArtist) ||
          normAuthor.includes('vevo') ||
          normAuthor.includes('topic') ||
          author.includes(primaryArtist.toLowerCase())
        ) {
          score += 800;
        }

        // 3. Official in title (+300)
        if (
          title.includes('official') ||
          title.includes('audio') ||
          title.includes('video') ||
          title.includes('clipe')
        ) {
          score += 300;
        }

        // 4. Timing proximity penalty
        score -= diffSec * 20;

        scoredCandidates.push({
          ...video,
          score: score + matchReport.sourceConfidence,
          diffSec,
        });
      }

      if (scoredCandidates.length === 0) continue;

      // Rank by highest score
      scoredCandidates.sort((a, b) => b.score - a.score);

      for (const video of scoredCandidates.slice(0, 2)) {
        const videoRes = await fetchWithTimeout(
          `${inst}/api/v1/videos/${video.videoId}?fields=adaptiveFormats`,
          {},
          4000
        );
        if (!videoRes.ok) continue;

        const videoData = (await videoRes.json()) as {
          adaptiveFormats?: { url?: string; type?: string; bitrate?: number }[];
        };

        const audioFormats = (videoData.adaptiveFormats || []).filter((f) =>
          f.type?.includes('audio')
        );

        if (audioFormats.length > 0) {
          const best = audioFormats.sort(
            (a, b) => (b.bitrate || 0) - (a.bitrate || 0)
          )[0];
          if (best.url && !isPreviewUrl(best.url)) {
            console.log(
              `[AudioResolver] Verified Official YouTube Master: "${video.title}" by "${video.author}" (${video.viewCount?.toLocaleString()} views, score: ${video.score})`
            );
            return {
              url: getPlayableAudioUrl(best.url),
              quality: 'high',
              format: 'm4a',
              source: 'youtube',
              confidence: 98,
              imageURL: video.videoThumbnails?.at(-1)?.url,
            };
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
};

/**
 * SoundCloud Resolver with strict Canonical Matcher validation
 */
export const resolveViaSoundCloud = async (
  trackName: string,
  artistName: string,
  expectedDurationMs?: number
): Promise<ResolvedAudio | null> => {
  try {
    let clientId = cachedSoundCloudClientId;

    const primaryArtist = (artistName || '').split(',')[0].split('&')[0].trim();
    const isGeneric =
      !primaryArtist ||
      primaryArtist.toLowerCase() === 'artista' ||
      primaryArtist.toLowerCase().includes('unknown');

    const searchQueries = isGeneric
      ? [trackName]
      : [`${primaryArtist} - ${trackName}`, trackName];

    for (const query of searchQueries) {
      const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
        query
      )}&client_id=${clientId}&limit=12`;

      let res = await fetchWithTimeout(
        searchUrl,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        },
        5000
      );

      // If 401, refresh client ID and retry
      if (res.status === 401) {
        clientId = await refreshSoundCloudClientId();
        const retryUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
          query
        )}&client_id=${clientId}&limit=12`;
        res = await fetchWithTimeout(retryUrl, {}, 5000);
      }

      if (!res.ok) continue;

      const data = (await res.json()) as { collection?: any[] };
      const candidates: any[] = [];

      for (const item of data.collection || []) {
        const matchReport = evaluateCandidateMatch(
          {
            title: item.title || '',
            artist: item.user?.username,
            durationMs: item.duration || 0,
            provider: 'soundcloud',
            url: item.permalink_url || '',
            playbackCount: item.playback_count,
          },
          {
            title: trackName,
            artists: primaryArtist ? [primaryArtist] : [],
            durationMs: expectedDurationMs || 0,
            spotifyId: '',
          }
        );

        if (
          matchReport.isVerified &&
          !hasUnwantedForbiddenWords(item.title, trackName)
        ) {
          candidates.push({ ...item, matchReport });
        }
      }

      if (candidates.length > 0) {
        candidates.sort(
          (a, b) =>
            b.matchReport.sourceConfidence - a.matchReport.sourceConfidence
        );
        const track = candidates[0];

        const transcodings = track.media?.transcodings || [];
        const nonDrmTranscodings = transcodings.filter((t: any) => {
          const p = (t.format?.protocol || '').toLowerCase();
          return (
            !p.includes('encrypted') &&
            !p.includes('cenc') &&
            !p.includes('cbcs')
          );
        });

        const sorted = [...nonDrmTranscodings].sort((a: any, b: any) => {
          if (a.format.protocol === 'progressive') return -1;
          if (b.format.protocol === 'progressive') return 1;
          return 0;
        });

        for (const transcoding of sorted) {
          if (!transcoding.url) continue;

          try {
            const streamRes = await fetchWithTimeout(
              `${transcoding.url}?client_id=${clientId}`,
              {},
              4000
            );

            if (streamRes.ok) {
              const streamData = (await streamRes.json()) as { url?: string };
              if (streamData.url && !isPreviewUrl(streamData.url)) {
                const isProgressive =
                  transcoding.format.protocol === 'progressive';
                const isM3u8 = streamData.url.includes('.m3u8');
                console.log(
                  `[AudioResolver] Verified SoundCloud Track: "${track.title}" by "${track.user?.username}" (Confidence: ${track.matchReport.sourceConfidence}%)`
                );
                return {
                  url: getPlayableAudioUrl(streamData.url),
                  quality: 'high',
                  format: isProgressive ? 'mp3' : isM3u8 ? 'm3u8' : 'mp3',
                  source: 'soundcloud',
                  confidence: track.matchReport.sourceConfidence,
                };
              }
            }
          } catch {
            continue;
          }
        }
      }
    }
  } catch (error) {
    console.warn('[AudioResolver] SoundCloud error:', error);
  }

  return null;
};

/**
 * Main audio resolver: resolves 100% master audio for the Spotify canonical track.
 */
export const resolveAudioUrl = async (
  trackName: string,
  artistName: string,
  spotifyId?: string,
  durationMs?: number,
  releaseDate?: string,
  forceFresh = false
): Promise<ResolvedAudio | null> => {
  const resolveKey = getAudioResolveKey(
    trackName,
    artistName,
    spotifyId,
    durationMs,
    releaseDate
  );
  const cached = forceFresh ? null : resolvedAudioCache.get(resolveKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const active = forceFresh ? null : activeAudioResolves.get(resolveKey);
  if (active) return active;

  const request = resolveAudioUrlInternal(
    trackName,
    artistName,
    spotifyId,
    durationMs,
    releaseDate,
    forceFresh
  )
    .then((result) => {
      if (result?.url && !forceFresh) {
        resolvedAudioCache.set(resolveKey, {
          value: result,
          expiresAt: Date.now() + AUDIO_RESOLVE_TTL_MS,
        });
      }
      return result;
    })
    .finally(() => {
      if (!forceFresh) activeAudioResolves.delete(resolveKey);
    });

  if (!forceFresh) activeAudioResolves.set(resolveKey, request);
  return request;
};

const resolveAudioUrlInternal = async (
  trackName: string,
  artistName: string,
  spotifyId?: string,
  durationMs?: number,
  releaseDate?: string,
  forceFresh = false
): Promise<ResolvedAudio | null> => {
  const youtubeVideoId = getYouTubeVideoIdFromTrackId(spotifyId);
  if (youtubeVideoId) {
    // A pasted YouTube URL is an exact source. Never replace it with a text
    // search result while its stream endpoint is available. If that signed
    // stream cannot be obtained, continue through the strict title/artist
    // resolver instead of making the track impossible to download.
    const exactResult = await resolveExactYouTubeVideo(youtubeVideoId, forceFresh);
    if (exactResult) return exactResult;
  }

  const isUnknownArtist =
    !artistName ||
    artistName.toLowerCase().includes('unknown') ||
    artistName.toLowerCase() === 'artista' ||
    artistName.trim() === trackName.trim();

  const primaryArtist = isUnknownArtist ? '' : artistName;
  const resolverMode = LOCAL_AUDIO_ONLY
    ? 'mode: local'
    : `backend: ${MUSIC_SERVER_URL || 'unavailable'}`;

  console.log(
    `[AudioResolver] ${Platform.OS} resolving "${artistName} - ${trackName}" (${durationMs || 0}ms), ${resolverMode}`
  );

  const directResult = await resolveDirectYouTubeAudio({
    title: trackName,
    artist: primaryArtist,
    durationMs,
    fresh: forceFresh,
  });
  if (directResult?.url) {
    console.log(
      `[AudioResolver] Resolved verified local stream: "${artistName} - ${trackName}"`
    );
    return {
      url: directResult.url,
      quality: 'high',
      format: directResult.format,
      source: 'youtube',
      confidence: 100,
      imageURL: directResult.imageURL,
    };
  }

  if (LOCAL_AUDIO_ONLY) {
    console.warn(
      `[AudioResolver] Local stream unavailable for "${artistName} - ${trackName}"; server fallback disabled.`
    );
    return null;
  }

  // Server is an explicit fallback. Local resolution keeps Googlevideo bytes
  // off Openfy infrastructure whenever the platform can fetch them directly.
  let backendFallback: ResolvedAudio | null = null;
  if (MUSIC_SERVER_URL) {
    try {
      const backendRes = await fetchWithHermesTimeout(
        `${MUSIC_SERVER_URL}/api/music/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: trackName,
            artist: primaryArtist,
            durationMs,
            spotifyId,
            releaseDate,
            includeLyrics: false,
          }),
        },
        WEB_BACKEND_TIMEOUT_MS
      );
      const data = (await (
        typeof backendRes.json === 'function'
          ? backendRes.json().catch(() => ({}))
          : Promise.resolve({})
      )) as BackendResolveResponse;

      if (backendRes.ok) {
        const payload = unwrapBackendResolvePayload(data);
        const source = payload.source || payload.playback;
        const streamUrl =
          payload.source?.streamUrl ||
          payload.playback?.directUrl ||
          payload.playback?.streamUrl ||
          payload.playback?.url;
        if (streamUrl) {
          console.log(
            `[AudioResolver] Resolved Playable Stream via Backend Server: "${payload.track?.title}"`
          );
          const backendResult: ResolvedAudio = {
            url:
              (source?.provider === 'youtube'
                ? getRenewableYouTubeAudioUrl(source.id)
                : null) || getPlayableAudioUrl(streamUrl),
            quality: source?.quality || 'high',
            format: source?.format || 'm4a',
            source: source?.provider === 'youtube' ? 'youtube' : 'soundcloud',
            confidence: Math.round((source?.score || 0.9) * 100),
            imageURL: payload.track?.imageURL || payload.artwork?.url,
          };

          if (backendResult.source === 'youtube') {
            return backendResult;
          }

          backendFallback = backendResult;
        } else {
          console.warn(
            `[AudioResolver] Backend returned no playable stream for "${artistName} - ${trackName}".`
          );
        }
      } else if (data.error?.code) {
        console.warn(
          `[AudioResolver] Backend resolve failed with ${data.error.code}: ${data.error.message || 'no details'}`
        );
      } else {
        console.warn(
          `[AudioResolver] Backend resolve returned HTTP ${backendRes.status ?? 'unknown'} for "${artistName} - ${trackName}".`
        );
      }
    } catch (error) {
      console.warn(
        `[AudioResolver] Backend resolve failed at ${MUSIC_SERVER_URL} for "${artistName} - ${trackName}": ${errorMessage(error)}`
      );
    }
  } else {
    console.warn(`[AudioResolver] Music server URL is empty on ${Platform.OS}.`);
  }

  // Browser CORS can reject a direct provider URL. Do not hide that behind
  // public proxies; only an explicitly configured server may be used here.
  if (Platform.OS === 'web') {
    if (backendFallback?.url && !isPreviewUrl(backendFallback.url)) {
      return backendFallback;
    }

    console.warn(
      `[AudioResolver] Web backend returned no playable stream for "${artistName} - ${trackName}".`
    );
    return null;
  }

  // Keep the same strict title, artist and duration matching on every
  // native platform. This lets iPhone recover when a local development
  // backend is unavailable instead of failing every track at once.
  const ytResult = await resolveViaYouTubeTopic(
    trackName,
    primaryArtist,
    durationMs
  );
  if (ytResult?.url && !isPreviewUrl(ytResult.url)) {
    return { ...ytResult, url: getPlayableAudioUrl(ytResult.url) };
  }

  if (backendFallback?.url && !isPreviewUrl(backendFallback.url)) {
    return {
      ...backendFallback,
      url: getPlayableAudioUrl(backendFallback.url),
    };
  }

  // 2. Last fallback: SoundCloud still must pass canonical title, artist and
  // duration checks before it can be used.
  const soundcloudResult = await resolveViaSoundCloud(
    trackName,
    primaryArtist,
    durationMs
  );
  if (soundcloudResult?.url && !isPreviewUrl(soundcloudResult.url)) {
    return {
      ...soundcloudResult,
      url: getPlayableAudioUrl(soundcloudResult.url),
    };
  }

  console.warn(
    `[AudioResolver] No verified source found for "${artistName} - ${trackName}" on ${Platform.OS}.`
  );
  return null;
};
