/**
 * Audio Resolver Service
 * High-speed full-length audio resolver with fast SoundCloud matching,
 * duration scoring (rejecting 30s snippets), and progressive/HLS stream delivery.
 */

export type ResolvedAudio = {
  url: string;
  quality: string;
  format: string;
  source: 'spotyloader' | 'soundcloud' | 'youtube';
};

// SpotDL Forbidden Words for anti-cover / anti-remix matching
const FORBIDDEN_WORDS = [
  'bassboosted',
  'remix',
  'reverb',
  'bassboost',
  'live',
  'acoustic',
  '8daudio',
  'concert',
  'acapella',
  'slowed',
  'instrumental',
  'cover',
  'karaoke',
  'tribute',
];

/**
 * Check if candidate title contains forbidden words not in original title (SpotDL algorithm)
 */
const hasUnwantedForbiddenWords = (
  candidateTitle: string,
  originalTitle: string
): boolean => {
  const cTitle = candidateTitle.toLowerCase();
  const oTitle = originalTitle.toLowerCase();

  for (const word of FORBIDDEN_WORDS) {
    if (cTitle.includes(word) && !oTitle.includes(word)) {
      return true;
    }
  }
  return false;
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
 * Fetch with timeout compatible with React Native / Hermes
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

let cachedSoundCloudClientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';
let lastClientIdFetch = Date.now();

/**
 * Refresh SoundCloud client ID dynamically if 401 occurs
 */
export const refreshSoundCloudClientId = async (): Promise<string> => {
  try {
    const pageRes = await fetchWithTimeout('https://soundcloud.com', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, 3500);

    if (pageRes.ok) {
      const html = await pageRes.text();
      const scriptUrls = [
        ...html.matchAll(/src="(https:\/\/[^"]+\.js)"/g),
      ].map((m) => m[1]);

      for (const url of scriptUrls.slice(-6)) {
        const jsRes = await fetchWithTimeout(url, {}, 2500);
        if (jsRes.ok) {
          const jsText = await jsRes.text();
          const match =
            jsText.match(/client_id:"([a-zA-Z0-9]{32})"/i) ||
            jsText.match(/client_id=([a-zA-Z0-9]{32})/i) ||
            jsText.match(/"client_id"\s*:\s*"([a-zA-Z0-9]{32})"/i);
          if (match && match[1]) {
            cachedSoundCloudClientId = match[1];
            lastClientIdFetch = Date.now();
            return cachedSoundCloudClientId;
          }
        }
      }
    }
  } catch {}

  return cachedSoundCloudClientId;
};

/**
 * Spotyloader Full-Track Engine (Exact Spotify Ground Truth)
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
      3000
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
      };
    }

    const jobId = data.jobId || data.id;
    if (!jobId) return null;

    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 500));

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
          2500
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
 * YouTube Topic search with stream extraction
 */
export const resolveViaYouTubeTopic = async (
  trackName: string,
  artistName: string
): Promise<ResolvedAudio | null> => {
  try {
    const query = `${artistName} - ${trackName} Official Audio`;

    const ytRes = await fetchWithTimeout(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
      3000
    );

    if (!ytRes.ok) return null;

    const html = await ytRes.text();
    const matches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
    const videoIds = [...new Set(matches.map((m) => m[1]))].filter(
      (id) => id.length === 11
    );

    if (videoIds.length === 0) return null;

    const videoId = videoIds[0];

    const streamGateways = [
      `https://pipedapi.kavin.rocks/streams/${videoId}`,
      `https://api.piped.private.coffee/streams/${videoId}`,
      `https://inv.nadeko.net/api/v1/videos/${videoId}`,
      `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
    ];

    for (const gateway of streamGateways) {
      try {
        const gRes = await fetchWithTimeout(gateway, {}, 2500);
        if (!gRes.ok) continue;

        const gData = (await gRes.json()) as {
          adaptiveFormats?: { url?: string; type?: string; container?: string }[];
          audioStreams?: { url?: string; format?: string; mimeType?: string }[];
        };

        const audio =
          gData.audioStreams?.find(
            (s) => s.url && !isPreviewUrl(s.url)
          ) ||
          gData.adaptiveFormats?.find(
            (f) => f.url && f.type?.includes('audio') && !isPreviewUrl(f.url)
          );

        if (audio && audio.url) {
          return {
            url: audio.url,
            quality: 'high',
            format: 'm4a',
            source: 'youtube',
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
 * SoundCloud Resolver with dynamic Client ID, Anti-Preview duration scoring,
 * and progressive MP3 & HLS stream extraction.
 */
export const resolveViaSoundCloud = async (
  trackName: string,
  artistName: string,
  expectedDurationMs?: number
): Promise<ResolvedAudio | null> => {
  try {
    let clientId = cachedSoundCloudClientId;
    const expectedSec =
      expectedDurationMs && expectedDurationMs > 0
        ? Math.round(expectedDurationMs / 1000)
        : 200;

    const query = `${artistName} ${trackName}`;
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      query
    )}&client_id=${clientId}&limit=10`;

    let res = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      3500
    );

    // If 401, refresh client ID and retry once
    if (res.status === 401) {
      clientId = await refreshSoundCloudClientId();
      const retryUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
        query
      )}&client_id=${clientId}&limit=10`;
      res = await fetchWithTimeout(retryUrl, {}, 3500);
    }

    if (!res.ok) return null;

    const data = (await res.json()) as { collection?: any[] };
    const candidates: any[] = [];

    for (const item of data.collection || []) {
      const durSec = Math.round((item.duration || 0) / 1000);
      // Reject short snippets (< 60s)
      if (durSec < 60) continue;
      // Reject huge mix files (> 900s)
      if (durSec > 900) continue;
      candidates.push({ ...item, durSec });
    }

    if (candidates.length === 0) return null;

    // Score and rank candidates by duration proximity to expected song duration
    candidates.sort((a, b) => {
      const diffA = Math.abs(a.durSec - expectedSec);
      const diffB = Math.abs(b.durSec - expectedSec);
      return diffA - diffB;
    });

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

      // Prioritize progressive MP3, then HLS
      const sorted = [...nonDrmTranscodings].sort((a, b) => {
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
            3000
          );

          if (streamRes.ok) {
            const streamData = (await streamRes.json()) as { url?: string };
            if (
              streamData.url &&
              !isPreviewUrl(streamData.url)
            ) {
              const isProgressive = transcoding.format.protocol === 'progressive';
              const isM3u8 = streamData.url.includes('.m3u8');
              return {
                url: streamData.url,
                quality: 'high',
                format: isProgressive ? 'mp3' : isM3u8 ? 'm3u8' : 'mp3',
                source: 'soundcloud',
              };
            }
          }
        } catch {
          continue;
        }
      }
    }
  } catch (error) {
    console.warn('[AudioResolver] SoundCloud error:', error);
  }

  return null;
};

/**
 * Main audio resolver: finds the 100% full-length master audio for the Spotify track.
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
    artistName.trim() === trackName.trim();

  const primaryArtist = isUnknownArtist ? '' : artistName;

  console.log(
    `[AudioResolver] Resolving Audio for: "${artistName} - ${trackName}" (${durationMs || 0}ms)`
  );

  // 1. PRIMARY: SoundCloud Anti-Preview Full-Length Stream (Fast & Reliable)
  const soundcloudResult = await resolveViaSoundCloud(
    trackName,
    primaryArtist,
    durationMs
  );
  if (soundcloudResult?.url && !isPreviewUrl(soundcloudResult.url)) {
    return soundcloudResult;
  }

  // 2. SECONDARY: Spotyloader 320kbps MP3 from Spotify ID
  if (spotifyId && !spotifyId.startsWith('dz_') && !spotifyId.startsWith('yt_')) {
    const spotyResult = await resolveViaSpotyloader(spotifyId);
    if (spotyResult?.url && !isPreviewUrl(spotyResult.url)) {
      return spotyResult;
    }
  }

  // 3. TERTIARY: YouTube Topic Official Master
  const ytResult = await resolveViaYouTubeTopic(trackName, primaryArtist);
  if (ytResult?.url && !isPreviewUrl(ytResult.url)) {
    return ytResult;
  }

  return null;
};
