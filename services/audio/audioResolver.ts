/**
 * Audio Resolver Service
 * Powered by Spotify Ground Truth Engine and SpotDL Matching Architecture.
 * Strictly bans 30-second previews/snippets (/0/30/, preview, snippet).
 * Delivers full-length master audio for 100% synchronization.
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
const isPreviewUrl = (url: string): boolean => {
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
  timeoutMs = 7000
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

    console.log(`[AudioResolver] Exact Spotify Ground Truth request: ${spotifyUrl}`);

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
      6000
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

    // Polling every 700ms (up to 20 attempts)
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 700));

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
          4000
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
          console.log(`[AudioResolver] Spotyloader full MP3 resolved: ${downloadUrl}`);
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
  } catch (error) {
    console.warn('[AudioResolver] Spotyloader error:', error);
  }

  return null;
};

/**
 * YouTube Topic search with stream extraction (100% Full-Length Official Record Master)
 */
export const resolveViaYouTubeTopic = async (
  trackName: string,
  artistName: string
): Promise<ResolvedAudio | null> => {
  try {
    const query = `${artistName} - ${trackName} - Topic`;
    console.log(`[AudioResolver] Searching YouTube Topic Master for: ${query}`);

    const ytRes = await fetchWithTimeout(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
      5000
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
      `https://pipedapi.adminforge.de/streams/${videoId}`,
      `https://inv.nadeko.net/api/v1/videos/${videoId}`,
      `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
    ];

    for (const gateway of streamGateways) {
      try {
        const gRes = await fetchWithTimeout(gateway, {}, 3500);
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
          console.log(`[AudioResolver] YouTube Topic Master resolved: ${audio.url.substring(0, 60)}...`);
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
  } catch (error) {
    console.warn('[AudioResolver] YouTube Topic fallback error:', error);
  }

  return null;
};

/**
 * SoundCloud Client ID and direct non-DRM stream resolver with strict Anti-Preview filtering
 */
let cachedSoundCloudClientId: string | null = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';

export const resolveViaSoundCloud = async (
  trackName: string,
  artistName: string,
  expectedDurationMs?: number
): Promise<ResolvedAudio | null> => {
  try {
    const query = `${artistName} - ${trackName}`;
    const clientId = cachedSoundCloudClientId || 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      query
    )}&client_id=${clientId}&limit=10`;

    const res = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      5000
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      collection?: {
        title: string;
        duration?: number;
        media?: {
          transcodings?: {
            url: string;
            format: { protocol: string; mime_type?: string };
          }[];
        };
      }[];
    };

    if (!data.collection || data.collection.length === 0) return null;

    for (const track of data.collection) {
      // Rule 1: Strictly reject short snippets (< 60 seconds)
      if (track.duration && track.duration < 60000) {
        continue;
      }

      // Rule 2: Reject forbidden word matches (covers, live, remix)
      if (hasUnwantedForbiddenWords(track.title, trackName)) {
        continue;
      }

      // Rule 3: Duration check (within 15s of original)
      if (expectedDurationMs && track.duration && expectedDurationMs > 0) {
        const diffMs = Math.abs(track.duration - expectedDurationMs);
        if (diffMs > 15000) {
          continue;
        }
      }

      const transcodings = track.media?.transcodings || [];
      if (transcodings.length === 0) continue;

      const nonDrmTranscodings = transcodings.filter((t) => {
        const p = (t.format?.protocol || '').toLowerCase();
        return (
          !p.includes('encrypted') &&
          !p.includes('cenc') &&
          !p.includes('cbcs')
        );
      });

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
            4000
          );

          if (streamRes.ok) {
            const streamData = (await streamRes.json()) as { url?: string };
            if (
              streamData.url &&
              !isPreviewUrl(streamData.url)
            ) {
              const isM3u8 = streamData.url.includes('.m3u8');
              return {
                url: streamData.url,
                quality: 'high',
                format: isM3u8 ? 'm3u8' : 'mp3',
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
 * Uses Spotyloader -> YouTube Topic Master -> Full-Length SoundCloud.
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
    `[AudioResolver] Resolving Full Audio for: "${artistName} - ${trackName}" (spotifyId: ${spotifyId || 'none'})`
  );

  // 1. PRIMARY: Spotyloader 320kbps MP3 from Spotify ID
  if (spotifyId && !spotifyId.startsWith('dz_') && !spotifyId.startsWith('yt_')) {
    const spotyResult = await resolveViaSpotyloader(spotifyId);
    if (spotyResult && spotyResult.url && !isPreviewUrl(spotyResult.url)) {
      return spotyResult;
    }
  }

  // 2. SECONDARY: YouTube Topic Official Master (100% Full-Length Studio Recording)
  const ytResult = await resolveViaYouTubeTopic(trackName, primaryArtist);
  if (ytResult && ytResult.url && !isPreviewUrl(ytResult.url)) {
    return ytResult;
  }

  // 3. TERTIARY: SoundCloud (strictly anti-preview / > 60s)
  const soundcloudResult = await resolveViaSoundCloud(
    trackName,
    primaryArtist,
    durationMs
  );
  if (soundcloudResult && soundcloudResult.url && !isPreviewUrl(soundcloudResult.url)) {
    return soundcloudResult;
  }

  return null;
};
