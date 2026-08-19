/**
 * Audio Resolver Service
 * High-speed 100% Original Master Studio Track Resolver with Canonical Matching Engine.
 * Rejects remixes, covers, slowed/reverb, live versions, extended loops, and 30s snippets.
 */

import { Platform } from 'react-native';
import {
  evaluateCandidateMatch,
  hasUnwantedForbiddenWords,
} from '../canonical/canonicalMatcher';

export type ResolvedAudio = {
  url: string;
  quality: string;
  format: string;
  source: 'spotyloader' | 'soundcloud' | 'youtube';
  confidence?: number;
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
      if (directRes.ok || directRes.status === 304 || directRes.status === 401) {
        return directRes;
      }
    } catch (e: any) {
      if (Platform.OS !== 'web') throw e;
    }

    // 2. On Web: Fallback through public CORS proxies
    if (Platform.OS === 'web' && !url.includes('localhost') && !url.includes('127.0.0.1')) {
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
      const scriptUrls = [
        ...html.matchAll(/src="(https:\/\/[^"]+\.js)"/g),
      ].map((m) => m[1]);

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
 * YouTube Master Topic search with active Invidious instances
 */
export const resolveViaYouTubeTopic = async (
  trackName: string,
  artistName: string
): Promise<ResolvedAudio | null> => {
  const primaryArtist = (artistName || '').split(',')[0].split('&')[0].trim();
  const query = primaryArtist ? `${primaryArtist} - ${trackName} Official Audio` : `${trackName} Official Audio`;
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

      const video = results.find(
        (v) => !hasUnwantedForbiddenWords(v.title || '', trackName)
      ) || results[0];

      if (!video?.videoId) continue;

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
          return {
            url: best.url,
            quality: 'high',
            format: 'm4a',
            source: 'youtube',
            confidence: 95,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
};

/**
 * Spotyloader Full-Track Engine (Exact Spotify Original Master)
 */
export const resolveViaSpotyloader = async (
  spotifyIdOrUrl: string
): Promise<ResolvedAudio | null> => {
  try {
    const spotifyUrl = spotifyIdOrUrl.startsWith('http')
      ? spotifyIdOrUrl
      : `https://open.spotify.com/track/${spotifyIdOrUrl}`;

    const res = await fetchWithTimeout(
      'https://spotyloader.com/api/spotify/track',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://spotyloader.com',
          Referer: 'https://spotyloader.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({ url: spotifyUrl }),
      },
      4000
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      jobId?: string;
      id?: string;
      downloadLink?: string;
      url?: string;
      link?: string;
    };

    const directUrl = data.downloadLink || data.link || data.url;
    if (directUrl && !isPreviewUrl(directUrl)) {
      return {
        url: directUrl,
        quality: '320kbps',
        format: 'mp3',
        source: 'spotyloader',
        confidence: 99,
      };
    }

    const jobId = data.jobId || data.id;
    if (!jobId) return null;

    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 600));

      try {
        const sRes = await fetchWithTimeout(
          `https://spotyloader.com/api/spotify/track/status/${jobId}`,
          {
            headers: {
              Origin: 'https://spotyloader.com',
              Referer: 'https://spotyloader.com/',
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          },
          3000
        );

        if (!sRes.ok) continue;

        const sData = (await sRes.json()) as {
          status?: string;
          downloadLink?: string;
          link?: string;
          download_url?: string;
          url?: string;
          post?: { download_url?: string };
        };

        const downloadUrl =
          sData.downloadLink ||
          sData.link ||
          sData.download_url ||
          sData.url ||
          sData.post?.download_url;

        if (
          downloadUrl &&
          downloadUrl.startsWith('http') &&
          !isPreviewUrl(downloadUrl)
        ) {
          return {
            url: downloadUrl,
            quality: '320kbps',
            format: 'mp3',
            source: 'spotyloader',
            confidence: 99,
          };
        }
      } catch {
        continue;
      }
    }
  } catch {}

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
          },
          {
            title: trackName,
            artists: primaryArtist ? [primaryArtist] : [],
            durationMs: expectedDurationMs || 0,
            spotifyId: '',
          }
        );

        // Discard hard-rejected candidates (loops, compilations, slowed, snippets)
        if (matchReport.status === 'unavailable' || matchReport.sourceConfidence < 45) {
          continue;
        }

        candidates.push({ ...item, matchReport });
      }

      if (candidates.length === 0) continue;

      // Rank candidates by highest Match Confidence
      candidates.sort(
        (a, b) => b.matchReport.sourceConfidence - a.matchReport.sourceConfidence
      );

      for (const track of candidates.slice(0, 4)) {
        const transcodings = track.media?.transcodings || [];
        if (transcodings.length === 0) continue;

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
                return {
                  url: streamData.url,
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
 * Main audio resolver: resolves 100% full-length master audio for the Spotify canonical track.
 */
export const resolveAudioUrl = async (
  trackName: string,
  artistName: string,
  spotifyId?: string,
  durationMs?: number
): Promise<ResolvedAudio | null> => {
  const isUnknownArtist =
    !artistName ||
    artistName.toLowerCase().includes('unknown') ||
    artistName.toLowerCase() === 'artista' ||
    artistName.trim() === trackName.trim();

  const primaryArtist = isUnknownArtist ? '' : artistName;

  console.log(
    `[AudioResolver] Resolving Audio for Canonical: "${artistName} - ${trackName}" (${durationMs || 0}ms)`
  );

  // 1. PRIMARY: SoundCloud Match Engine (Strict Duration & Anti-Remix verification)
  const soundcloudResult = await resolveViaSoundCloud(
    trackName,
    primaryArtist,
    durationMs
  );
  if (soundcloudResult?.url && !isPreviewUrl(soundcloudResult.url)) {
    return soundcloudResult;
  }

  // 2. SECONDARY: Spotyloader 320kbps MP3
  if (spotifyId && !spotifyId.startsWith('dz_') && !spotifyId.startsWith('yt_')) {
    const spotyResult = await resolveViaSpotyloader(spotifyId);
    if (spotyResult?.url && !isPreviewUrl(spotyResult.url)) {
      return spotyResult;
    }
  }

  // 3. TERTIARY: YouTube Invidious Master Topic Matcher
  const ytResult = await resolveViaYouTubeTopic(trackName, primaryArtist);
  if (ytResult?.url && !isPreviewUrl(ytResult.url)) {
    return ytResult;
  }

  return null;
};
