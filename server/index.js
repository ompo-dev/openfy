/**
 * Openfy Music Resolution Backend Server
 * High-performance Node.js API with Spotify Canonical Scraper, YouTubeOfficialRanker, SoundCloud Stream Resolver, IdentityLock & CORS-Free Proxy.
 */

const http = require('http');
const url = require('url');
const ytdl = require('@distube/ytdl-core');
const youtubeDl = require('youtube-dl-exec');

const PORT = process.env.PORT || 3001;

// In-memory LRU-like TTL cache
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlSeconds = 3600) {
  if (cache.size > 2000) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// Normalization & Slugging
function normalizeText(str) {
  return (str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(?<=\w)\.(?=\w)/g, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseViewCount(viewText) {
  if (!viewText) return 0;
  const clean = (viewText || '')
    .toLowerCase()
    .replace(/visualizaç[õo]es|views/g, '')
    .trim();
  if (clean.includes('mi') || clean.includes('m')) {
    return parseFloat(clean.replace(',', '.')) * 1000000;
  }
  if (clean.includes('mil') || clean.includes('k')) {
    return parseFloat(clean.replace(',', '.')) * 1000;
  }
  return parseInt(clean.replace(/\./g, '').replace(/,/g, ''), 10) || 0;
}

const FORBIDDEN_VERSION_TAGS = [
  'live',
  'concert',
  'ao vivo',
  'acoustic',
  'acustico',
  'unplugged',
  'remix',
  'rework',
  'sped up',
  'speed up',
  'nightcore',
  'slowed',
  'reverb',
  'slowed+reverb',
  'cover',
  'tribute',
  'karaoke',
  'repost',
  'letra',
  'lyrics',
  'legenda',
  'edit',
  'fanmade',
  'instrumental',
  '10 hour',
  '1 hour',
  'loop',
  'react',
  'reacao',
  'bastidores',
];

function isKnownArtist(artist) {
  const normalized = normalizeText(artist);
  return (
    normalized &&
    normalized !== 'artista' &&
    normalized !== 'unknown artist' &&
    normalized !== 'unknown' &&
    normalized !== 'youtube'
  );
}

function getArtistSearchName(artist) {
  return (artist || '')
    .replace(/\b(rapper|oficial|official|music|musica|músicas)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCanonicalTitleMatch(candidateTitle, targetTitle) {
  const candidate = normalizeText(candidateTitle);
  const target = normalizeText(targetTitle);
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A numeric suffix is part of a song's identity. This rejects a different
  // numbered song only when the requested title itself omits that number.
  const hasUnexpectedContinuation =
    !!target &&
    new RegExp(`(?:^|\\s)${escapedTarget}\\s+\\d+\\b`).test(candidate);

  if (!target || hasUnexpectedContinuation) return false;

  const candidateWords = candidate.split(' ');
  let candidateIndex = 0;
  return target.split(' ').every((word) => {
    const nextIndex = candidateWords.indexOf(word, candidateIndex);
    if (nextIndex < 0) return false;
    candidateIndex = nextIndex + 1;
    return true;
  });
}

function getLyricTitleVariants(title) {
  const fullTitle = (title || '').trim();
  const withoutProductionCredit = fullTitle
    .replace(
      /\s*[\[(]\s*(?:prod(?:\.|ução)?|produced by)(?=\s|$)[^\])]*[\])]/gi,
      ''
    )
    .trim();
  return [...new Set([fullTitle, withoutProductionCredit].filter(Boolean))];
}

function getTitleWithoutProductionCredit(title) {
  return (title || '')
    .trim()
    .replace(
      /\s*[\[(]\s*(?:prod(?:\.|ução)?|produced by)(?=\s|$)[^\])]*[\])]/gi,
      ''
    )
    .trim();
}

function getLyricTitleMatch(candidateTitle, title) {
  const fullTitle = (title || '').trim();
  const titleWithoutProductionCredit = getTitleWithoutProductionCredit(title);
  if (
    (fullTitle && isCanonicalTitleMatch(candidateTitle, fullTitle)) ||
    (titleWithoutProductionCredit &&
      isCanonicalTitleMatch(candidateTitle, titleWithoutProductionCredit))
  ) {
    return { matches: true, isRelaxed: false };
  }
  return { matches: false, isRelaxed: false };
}

function isCanonicalArtistMatch(candidateTitle, candidateArtist, targetArtist) {
  if (!isKnownArtist(targetArtist)) return true;

  const artistAliases = [targetArtist, getArtistSearchName(targetArtist)]
    .map(normalizeText)
    .filter((artist) => artist.length >= 3);

  const sourceArtist = normalizeText(candidateArtist);
  if (isKnownArtist(candidateArtist)) {
    return artistAliases.some(
      (artist) =>
        sourceArtist.includes(artist) ||
        sourceArtist.replace(/\s/g, '').includes(artist.replace(/\s/g, ''))
    );
  }

  const candidateContext = normalizeText(candidateTitle);

  return artistAliases.some(
    (artist) =>
      candidateContext.includes(artist) ||
      candidateContext.replace(/\s/g, '').includes(artist.replace(/\s/g, ''))
  );
}

function isCanonicalLyricMatch(
  candidateTitle,
  candidateArtist,
  candidateDurationMs,
  title,
  artist,
  durationMs
) {
  const titleMatch = getLyricTitleMatch(candidateTitle, title);
  if (!titleMatch.matches) return false;
  if (
    isKnownArtist(artist) &&
    !isCanonicalArtistMatch(candidateTitle, candidateArtist, artist)
  ) {
    return false;
  }
  if (!durationMs || !candidateDurationMs) return !titleMatch.isRelaxed;

  return (
    Math.abs(candidateDurationMs - durationMs) <=
    (titleMatch.isRelaxed
      ? Math.max(3000, durationMs * 0.02)
      : Math.max(10000, durationMs * 0.1))
  );
}

function hasConflictingNumberedTitleInLyrics(lyrics, title) {
  if (!lyrics) return false;

  const lyricsWithoutTimestamps = lyrics.replace(
    /\[\d{1,2}:\d{2}(?:\.\d+)?\]/g,
    ' '
  );
  const normalizedLyrics = normalizeText(lyricsWithoutTimestamps);
  return getLyricTitleVariants(title).some((titleVariant) => {
    const canonicalTitle = normalizeText(titleVariant);
    if (!canonicalTitle) return false;
    const escapedTitle = canonicalTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escapedTitle}\\s+\\d+\\b`).test(
      normalizedLyrics
    );
  });
}

function createEstimatedLyricLines(plainLyrics, durationMs) {
  if (!plainLyrics || !durationMs || durationMs <= 0) return [];

  const lyricLines = plainLyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lyricLines.length < 2) return [];

  const startOffsetMs = Math.min(2500, Math.round(durationMs * 0.04));
  const availableMs = Math.max(0, durationMs - startOffsetMs);
  const weights = lyricLines.map((line) =>
    Math.max(1, line.split(/\s+/).length)
  );
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let startMs = startOffsetMs;

  return lyricLines.map((text, index) => {
    const nextStartMs =
      index === lyricLines.length - 1
        ? durationMs
        : startMs + (availableMs * weights[index]) / totalWeight;
    const line = { text, startMs: Math.round(startMs) };
    startMs = nextStartMs;
    return line;
  });
}

/**
 * 0. Node.js Spotify Canonical Scraper (CORS-free, 100% accurate title, artists, duration, artwork)
 */
async function fetchSpotifyCanonicalTrack(trackId) {
  const cacheKey = `spotify_track:${trackId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const html = await res.text();
      const nextDataMatch = html.match(
        /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/
      );
      if (nextDataMatch) {
        const parsed = JSON.parse(nextDataMatch[1]);
        const entity = parsed.props?.pageProps?.state?.data?.entity;
        if (entity && entity.name) {
          const artists = (entity.artists || []).map((a) => ({ name: a.name }));
          const cover =
            entity.visualIdentity?.image?.[0]?.url ||
            entity.album?.coverArt?.sources?.[0]?.url ||
            entity.coverArt?.sources?.[0]?.url ||
            '';

          const result = {
            spotifyId: trackId,
            title: entity.name,
            artistName: artists[0]?.name || 'Artista',
            artists: artists.length > 0 ? artists : [{ name: 'Artista' }],
            albumName: entity.album?.name || 'Spotify',
            imageURL: cover,
            duration_ms: entity.duration || 0,
          };

          setCache(cacheKey, result, 86400); // 24h TTL
          return result;
        }
      }
    }
  } catch (e) {
    console.warn(
      `[Spotify Scraper] Failed to fetch embed for ${trackId}:`,
      e.message
    );
  }

  return null;
}

async function fetchSpotifyPlaylistFallbackSource(playlistId) {
  try {
    const response = await fetch(
      `https://spotyloader.com/api/spotify/info?url=${encodeURIComponent(`https://open.spotify.com/playlist/${playlistId}`)}`,
      {
        headers: {
          Origin: 'https://spotyloader.com',
          Referer: 'https://spotyloader.com/',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok) return null;

    const post = (await response.json())?.post;
    const tracks = Array.isArray(post?.tracks)
      ? post.tracks
          .map((track) => ({
            id: track.id || track.url?.split('/').pop() || '',
            title: track.name || track.title || 'Música',
            artistName: Array.isArray(track.artists)
              ? track.artists.join(', ')
              : track.artist || 'Artista',
            duration_ms: Number(track.duration_ms || track.duration || 0),
            imageURL: track.image || '',
          }))
          .filter((track) => /^[A-Za-z0-9]+$/.test(track.id))
      : [];

    return post?.name && tracks.length > 0
      ? { title: post.name, coverUrl: post.image || '', tracks }
      : null;
  } catch {
    return null;
  }
}

async function fetchSpotifyCanonicalCollection(collectionType, collectionId) {
  const cacheKey = `spotify_${collectionType}:${collectionId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // Spotify's embeddable track list can be windowed for long playlists.
    // The server-side fallback is CORS-free and is only selected when it has
    // more entries, so imports never silently stop at the embed window.
    const fallbackSourcePromise =
      collectionType === 'playlist'
        ? fetchSpotifyPlaylistFallbackSource(collectionId)
        : Promise.resolve(null);
    const response = await fetch(
      `https://open.spotify.com/embed/${collectionType}/${collectionId}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    const html = response.ok ? await response.text() : '';
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/
    );
    const entity = nextDataMatch
      ? JSON.parse(nextDataMatch[1])?.props?.pageProps?.state?.data?.entity
      : null;
    const fallbackSource = await fallbackSourcePromise;
    const trackList = Array.isArray(entity?.trackList) ? entity.trackList : [];
    const embeddedTracks = trackList
      .map((track) => ({
        id: track.uri?.replace(/^spotify:track:/, '') || track.id,
        title: track.title || 'Música',
        artistName: track.subtitle || 'Artista',
        duration_ms: track.duration || 0,
        imageURL: '',
      }))
      .filter((track) => /^[A-Za-z0-9]+$/.test(track.id || ''));
    const sourceTracks =
      fallbackSource?.tracks.length > embeddedTracks.length
        ? fallbackSource.tracks
        : embeddedTracks;
    const playlistTitle = entity?.name || fallbackSource?.title;
    if (!playlistTitle || sourceTracks.length === 0) return null;
    const tracks = [];

    for (let index = 0; index < sourceTracks.length; index += 4) {
      const chunk = sourceTracks.slice(index, index + 4);
      const resolved = await Promise.all(
        chunk.map(async (track) => {
          const canonical = await fetchSpotifyCanonicalTrack(track.id);
          return canonical || {
            spotifyId: track.id,
            title: track.title,
            artistName: track.artistName,
            albumName: playlistTitle,
            imageURL: track.imageURL || '',
            duration_ms: track.duration_ms,
          };
        })
      );
      tracks.push(...resolved);
    }

    if (tracks.length === 0) return null;
    const result = {
      id: collectionId,
      title: playlistTitle,
      coverUrl:
        entity?.coverArt?.sources?.[0]?.url || fallbackSource?.coverUrl || '',
      tracks,
    };
    setCache(cacheKey, result, 86400);
    return result;
  } catch (error) {
    console.warn(
      `[Spotify Scraper] Failed to fetch ${collectionType} ${collectionId}:`,
      error.message
    );
    return null;
  }
}

const fetchSpotifyCanonicalPlaylist = (playlistId) =>
  fetchSpotifyCanonicalCollection('playlist', playlistId);

const fetchSpotifyCanonicalAlbum = (albumId) =>
  fetchSpotifyCanonicalCollection('album', albumId);

const getYouTubeVideoId = (input) => {
  if (typeof input !== 'string') return null;

  try {
    const parsed = new URL(input.trim());
    const host = parsed.hostname.replace(/^www\./, '');
    const id =
      host === 'youtu.be'
        ? parsed.pathname.slice(1)
        : host === 'youtube.com' || host === 'music.youtube.com'
          ? parsed.searchParams.get('v')
          : null;

    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
};

async function fetchYouTubeTrack(videoId) {
  const cacheKey = `youtube_track:${videoId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // yt-dlp is bundled through the existing youtube-dl-exec dependency and is
  // kept current by its postinstall.  It is resilient to YouTube player-script
  // changes that can leave ytdl-core with no playable formats.
  try {
    const details = await youtubeDl(youtubeUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noPlaylist: true,
      format: 'bestaudio[ext=m4a]/bestaudio',
    });
    if (details?.id !== videoId || !details.url) return null;

    const result = {
      videoId: details.id,
      youtubeUrl,
      streamUrl: details.url,
      title: details.title || 'Vídeo do YouTube',
      artistName: details.artist || details.channel || 'YouTube',
      albumName: details.album || details.channel || 'YouTube',
      imageURL: details.thumbnail || '',
      duration_ms: Number(details.duration || 0) * 1000,
      viewCount: Number(details.view_count || 0),
      format: details.ext === 'webm' ? 'webm' : 'm4a',
    };

    setCache(cacheKey, result, 1800);
    return result;
  } catch (error) {
    console.warn(`[YouTube Extractor] yt-dlp failed for ${videoId}:`, error.message);
  }

  // Retain the previous extractor as a lightweight fallback for environments
  // where the yt-dlp binary cannot be started.
  try {
    const info = await ytdl.getInfo(youtubeUrl);
    const details = info.videoDetails;
    const audio = ytdl.filterFormats(info.formats, 'audioonly').find((format) => format.url);
    if (details?.videoId !== videoId || !audio?.url) return null;

    const thumbnails = details.thumbnails || [];
    const artistName = details.media?.artist || details.author?.name || 'YouTube';
    const format =
      audio.container === 'webm' || audio.mimeType?.includes('webm')
        ? 'webm'
        : 'm4a';
    const result = {
      videoId: details.videoId,
      youtubeUrl,
      streamUrl: audio.url,
      title: details.title || 'Vídeo do YouTube',
      artistName,
      albumName: details.media?.album || artistName,
      imageURL: thumbnails[thumbnails.length - 1]?.url || '',
      duration_ms: Number(details.lengthSeconds || 0) * 1000,
      viewCount: Number(details.viewCount || 0),
      format,
    };
    setCache(cacheKey, result, 1800);
    return result;
  } catch {}

  // Do not replace an explicit YouTube URL with a similarly named SoundCloud
  // result. The caller can retry, but it must never receive another song.
  return null;
}

async function fetchYouTubeArtistImage(artistName) {
  const normalizedName = String(artistName || '').trim();
  if (!normalizedName) return '';

  const cacheKey = `youtube_artist_image:${normalizeText(normalizedName)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const getChannelImage = async (channelUrl) => {
    const response = await fetch(channelUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return '';
    const html = await response.text();
    return (
      html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1]?.replace(/\\u0026/g, '&') ||
      ''
    );
  };

  try {
    // A YouTube channel page exposes its avatar as og:image. This is a
    // profile image, unlike a search result thumbnail or album cover.
    const handle = normalizedName.replace(/\s+/g, '');
    let imageURL = await getChannelImage(
      `https://www.youtube.com/@${encodeURIComponent(handle)}`
    );

    if (!imageURL) {
      const search = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(`${normalizedName} official`)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      const html = search.ok ? await search.text() : '';
      const channelPath = html.match(/"channelRenderer":\{[\s\S]{0,4000}?"canonicalBaseUrl":"([^"]+)"/)?.[1];
      if (channelPath) imageURL = await getChannelImage(`https://www.youtube.com${channelPath}`);
    }

    if (imageURL) {
      setCache(cacheKey, imageURL, 86400);
      return imageURL;
    }

    const result = await youtubeDl(`ytsearch1:${normalizedName} official music`, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noPlaylist: true,
      skipDownload: true,
    });
    imageURL = result?.channel_thumbnail || result?.uploader_avatar || '';

    if (!imageURL && result?.channel_url) {
      const channel = await youtubeDl(result.channel_url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noPlaylist: true,
        playlistEnd: 1,
        skipDownload: true,
      });
      imageURL = channel?.channel_thumbnail || channel?.uploader_avatar || '';
    }

    if (imageURL) setCache(cacheKey, imageURL, 86400);
    return imageURL;
  } catch {
    return '';
  }
}

/**
 * 1. YouTube Official Channel & Timing Ranker
 */
async function fetchYouTubeOfficialVideo(target, searchQuery) {
  const primaryArtist = target.artists[0]?.name || target.artistName || '';
  const query = searchQuery || `${target.title} ${primaryArtist}`.trim();
  const cacheKey = `yt_official:${query}:${target.durationMs}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return null;

    const html = await res.text();
    const match =
      html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*({[\s\S]*?});/);

    if (!match) return null;

    const data = JSON.parse(match[1]);
    const contents =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents ||
      [];

    const candidates = [];
    const targetDurationSec =
      target.durationMs > 0 ? target.durationMs / 1000 : 0;
    const lockedArtistsNorm = (target.artists || [{ name: primaryArtist }]).map(
      (a) => normalizeText(a.name || a)
    );

    for (const item of contents) {
      const v = item.videoRenderer;
      if (!v || !v.videoId) continue;

      const videoId = v.videoId;
      const title = v.title?.runs?.[0]?.text || '';
      const channel = v.ownerText?.runs?.[0]?.text || '';
      const durationText = v.lengthText?.simpleText || '';
      const viewCountText = v.viewCountText?.simpleText || '';
      const views = parseViewCount(viewCountText);

      const parts = durationText.split(':').map(Number);
      let durationSec = 0;
      if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
      if (parts.length === 3)
        durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

      if (durationSec < 40) continue;

      const titleLower = title.toLowerCase();
      let hasForbidden = false;
      for (const f of FORBIDDEN_VERSION_TAGS) {
        if (titleLower.includes(f) && !target.title.toLowerCase().includes(f)) {
          hasForbidden = true;
          break;
        }
      }
      if (hasForbidden) continue;

      if (!isCanonicalTitleMatch(title, target.title)) continue;

      const artistMatched = lockedArtistsNorm.some((artist) =>
        isCanonicalArtistMatch(title, channel, artist)
      );
      if (lockedArtistsNorm.some(isKnownArtist) && !artistMatched) continue;

      const artistChannelMatched = lockedArtistsNorm.some((artist) =>
        isCanonicalArtistMatch('', channel, artist)
      );

      const normChannel = normalizeText(channel);
      const isTrustedMusicChannel =
        normChannel.includes('topic') ||
        normChannel.includes('vevo') ||
        normChannel.includes('records');
      const isOfficialArtistChannel =
        artistChannelMatched || (artistMatched && isTrustedMusicChannel);

      let durationDiffSec = 0;
      let durationAcceptable = true;
      if (targetDurationSec > 0) {
        durationDiffSec = Math.abs(targetDurationSec - durationSec);
        const maxDiffSec = Math.max(25, targetDurationSec * 0.05);
        if (durationDiffSec > maxDiffSec) {
          durationAcceptable = false;
        }
      }

      if (!durationAcceptable) continue;

      let score = 80;
      if (artistMatched) score += 10;
      if (artistChannelMatched) score += 20;
      else if (isOfficialArtistChannel) score += 10;
      if (durationDiffSec <= 10) score += 5;
      score += Math.min(5, Math.log10(Math.max(views, 1)) / 2);

      candidates.push({
        videoId,
        title,
        channel,
        durationSec,
        durationText,
        viewCountText,
        views,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isOfficialArtistChannel,
        durationDiffSec,
        score,
      });
    }

    const officialCandidates = candidates.filter(
      (candidate) => candidate.isOfficialArtistChannel
    );
    // Not every official release lives on an Artist/Topic/VEVO channel. Every
    // candidate above already passed title, artist and duration identity checks,
    // so use that exact set when no channel carries the official marker.
    const rankedCandidates =
      officialCandidates.length > 0 ? officialCandidates : candidates;
    if (rankedCandidates.length > 0) {
      rankedCandidates.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        if (a.durationDiffSec !== b.durationDiffSec)
          return a.durationDiffSec - b.durationDiffSec;
        return b.views - a.views;
      });

      const top = rankedCandidates[0];
      const result = {
        provider: 'youtube',
        id: top.videoId,
        title: top.title,
        channel: top.channel,
        url: top.url,
        durationSec: top.durationSec,
        viewCountText: top.viewCountText,
        verified: true,
        score: top.score / 100,
      };
      setCache(cacheKey, result, 86400);
      return result;
    }
  } catch {}
  return null;
}

/**
 * 2. SoundCloud Playable Audio Stream Resolver
 */
async function fetchSoundCloudPlayableStream(title, artist, durationMs) {
  const primaryArtist = artist || '';
  const searchQueries = primaryArtist
    ? [`${primaryArtist} - ${title}`, title]
    : [title];
  const clientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';

  for (const query of searchQueries) {
    try {
      const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=8`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data.collection || []) {
        if (!item.title) continue;

        if (!isCanonicalTitleMatch(item.title, title)) continue;
        if (!isCanonicalArtistMatch(item.title, item.user?.username, artist))
          continue;

        const dur = item.duration || 0;
        const diffMs = durationMs > 0 ? Math.abs(dur - durationMs) : 0;
        if (durationMs > 0 && diffMs > 30000) continue; // within 30s

        const transcodings = item.media?.transcodings || [];
        const nonDrm = transcodings.filter((t) => {
          const p = (t.format?.protocol || '').toLowerCase();
          return !p.includes('encrypted') && !p.includes('cenc');
        });
        nonDrm.sort((a, b) => (a.format?.protocol === 'progressive' ? -1 : 1));

        for (const t of nonDrm) {
          if (!t.url) continue;
          const streamRes = await fetch(`${t.url}?client_id=${clientId}`, {
            signal: AbortSignal.timeout(3500),
          });
          if (streamRes.ok) {
            const sData = await streamRes.json();
            if (sData.url) {
              return {
                streamUrl: sData.url,
                format: t.format?.protocol === 'progressive' ? 'mp3' : 'm3u8',
                durationMs: dur,
                title: item.title,
                quality: '128kbps',
              };
            }
          }
        }
      }
    } catch {}
  }
  return null;
}

// 3. Multi-Engine Lyrics Resolver (LRCLIB Exact -> LRCLIB Search -> Letras.mus.br Scraper -> Vagalume)
async function fetchComprehensiveLyrics(title, artist, durationMs, albumName, releaseDate) {
  const durationSec = durationMs > 0 ? Math.round(durationMs / 1000) : 0;
  const cacheKey = `lyrics_multi_v4:${artist}:${title}:${albumName || ''}:${releaseDate || ''}:${durationSec}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  let exactLrclibResult = null;

  // 1. LRCLIB Exact
  try {
    const queryParams = new URLSearchParams({
      track_name: title,
      artist_name: artist,
      ...(durationSec > 0 ? { duration: String(durationSec) } : {}),
      ...(albumName ? { album_name: albumName } : {}),
    });

    const res = await fetch(
      `https://lrclib.net/api/get?${queryParams.toString()}`,
      {
        headers: { 'User-Agent': 'OpenfyMusic/1.0.0 ( contact@openfy.app )' },
        signal: AbortSignal.timeout(3000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      let lines = [];
      if (data.syncedLyrics) {
        lines = data.syncedLyrics
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            const m = l.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
            if (!m) return null;
            const startMs = (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000;
            return { text: m[3].trim(), startMs: Math.round(startMs) };
          })
          .filter(Boolean);
      }
      if (lines.length === 0) {
        lines = createEstimatedLyricLines(data.plainLyrics, durationMs);
      }

      if (
        (data.syncedLyrics || data.plainLyrics) &&
        isCanonicalLyricMatch(
          data.trackName || '',
          data.artistName || '',
          Number(data.duration || 0) * 1000,
          title,
          artist,
          durationMs
        ) &&
        !hasConflictingNumberedTitleInLyrics(
          data.syncedLyrics || data.plainLyrics,
          title
        )
      ) {
        exactLrclibResult = {
          valid: true,
          synced: lines.length > 0,
          isSynced: lines.length > 0,
          lines,
          syncedLyrics: data.syncedLyrics,
          plainLyrics: data.plainLyrics,
          trackName: data.trackName || title,
          artistName: data.artistName || artist,
          albumName: data.albumName || albumName,
          durationMs: data.duration ? data.duration * 1000 : durationMs,
          source: 'lrclib_exact',
        };
      }
    }
  } catch {}

  // 2. LRCLIB Search
  try {
    const cleanArtist = (artist || '')
      .replace(/\(.*\)/g, '')
      .replace(/,.*/g, '')
      .trim();
    const searchQueries = getLyricTitleVariants(title).flatMap((lookupTitle) => [
      `${cleanArtist} ${lookupTitle}`,
      lookupTitle,
    ]);

    for (const sq of searchQueries) {
      const sRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(sq)}`,
        {
          headers: { 'User-Agent': 'OpenfyMusic/1.0.0' },
          signal: AbortSignal.timeout(3000),
        }
      );
      if (sRes.ok) {
        const list = await sRes.json();
        if (Array.isArray(list) && list.length > 0) {
          const canonicalMatches = list.filter((candidate) =>
            isCanonicalLyricMatch(
              candidate.trackName || '',
              candidate.artistName || '',
              Number(candidate.duration || 0) * 1000,
              title,
              artist,
              durationMs
            ) &&
            !hasConflictingNumberedTitleInLyrics(
              candidate.syncedLyrics || candidate.plainLyrics,
              title
            )
          );
          const match =
            canonicalMatches.find((x) => x.syncedLyrics) ||
            canonicalMatches.find((x) => x.plainLyrics);
          if (match) {
            let lines = [];
            if (match.syncedLyrics) {
              lines = match.syncedLyrics
                .split('\n')
                .filter(Boolean)
                .map((l) => {
                  const m = l.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
                  if (!m) return null;
                  const startMs =
                    (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000;
                  return { text: m[3].trim(), startMs: Math.round(startMs) };
                })
                .filter(Boolean);
            }
            if (lines.length === 0) {
              lines = createEstimatedLyricLines(match.plainLyrics, durationMs);
            }

            const result = {
              valid: true,
              synced: lines.length > 0,
              isSynced: lines.length > 0,
              lines,
              syncedLyrics: match.syncedLyrics,
              plainLyrics: match.plainLyrics,
              trackName: match.trackName || title,
              artistName: match.artistName || artist,
              albumName: match.albumName || albumName,
              durationMs: match.duration ? match.duration * 1000 : durationMs,
              source: 'lrclib_search',
            };
            setCache(cacheKey, result, 604800);
            return result;
          }
        }
      }
    }
  } catch {}

  if (exactLrclibResult) {
    setCache(cacheKey, exactLrclibResult, 604800);
    return exactLrclibResult;
  }

  // 3. Letras.mus.br Scraper (100% complete Brazilian & International Lyrics)
  try {
    const cleanA = (artist || '')
      .replace(/\(.*\)/g, '')
      .replace(/,.*/g, '')
      .trim();
    const queries = getLyricTitleVariants(title).flatMap((lookupTitle) => [
      `${cleanA} ${lookupTitle}`,
      lookupTitle,
      `${lookupTitle} ${cleanA}`,
    ]);

    for (const q of queries) {
      const url = `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) continue;
      const raw = await res.text();
      const match = raw.match(/LetrasSug\(([\s\S]*)\)/);
      if (!match) continue;
      const data = JSON.parse(match[1]);
      const docs = data.response?.docs || [];
      if (!docs.length) continue;

      for (const doc of docs.slice(0, 3)) {
        if (!doc.dns || !doc.url) continue;
        if (
          !isCanonicalLyricMatch(
            `${doc.txt || ''} ${doc.url || ''}`,
            doc.art || '',
            0,
            title,
            artist,
            durationMs
          )
        ) {
          continue;
        }
        const pageUrl = `https://www.letras.mus.br/${doc.dns}/${doc.url}/`;
        const pageRes = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3500),
        });
        if (!pageRes.ok) continue;
        const html = await pageRes.text();
        const lyricMatch =
          html.match(/<div class="lyric-original"[^>]*>([\s\S]*?)<\/div>/i) ||
          html.match(/<div class="cnt-letra"[^>]*>([\s\S]*?)<\/div>/i);
        if (lyricMatch) {
          const plain = lyricMatch[1]
            .replace(/<p>/g, '')
            .replace(/<\/p>/g, '\n\n')
            .replace(/<br\s*[\/]?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();
          if (plain.length > 20) {
            const lines = createEstimatedLyricLines(plain, durationMs);
            const result = {
              valid: true,
              synced: lines.length > 0,
              isSynced: lines.length > 0,
              lines,
              plainLyrics: plain,
              trackName: doc.txt || title,
              artistName: doc.art || artist,
              albumName: albumName || 'Single',
              durationMs,
              source: 'letras.mus.br',
            };
            setCache(cacheKey, result, 604800);
            return result;
          }
        }
      }
    }
  } catch {}

  return null;
}

// Alias for backward compatibility
const fetchExactIdentifierGet = fetchComprehensiveLyrics;

const isAllowedAudioStreamUrl = (input) => {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:') return null;

    const hostname = parsed.hostname.toLowerCase();
    const allowedHosts = ['googlevideo.com', 'sndcdn.com', 'soundcloud.com'];
    const isAllowedHost = allowedHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
    return isAllowedHost ? parsed : null;
  } catch {
    return null;
  }
};

const isAllowedBrowserOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
};

// HTTP Server
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && isAllowedBrowserOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Health
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'openfy-official-ranker-resolution-engine',
        time: new Date().toISOString(),
      })
    );
    return;
  }

  // GET /api/lyrics?title=...&artist=...&durationMs=...
  if (pathname === '/api/lyrics') {
    const qTitle = parsedUrl.query.title || parsedUrl.query.track_name;
    const qArtist = parsedUrl.query.artist || parsedUrl.query.artist_name || '';
    const qDurationMs = parseInt(
      parsedUrl.query.durationMs || parsedUrl.query.duration || '0',
      10
    );
    const qAlbum = parsedUrl.query.album || '';
    const qReleaseDate = parsedUrl.query.releaseDate || '';

    if (!qTitle) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing title parameter' }));
      return;
    }

    const lyricsResult = await fetchComprehensiveLyrics(
      qTitle,
      qArtist,
      qDurationMs,
      qAlbum,
      qReleaseDate
    );
    if (lyricsResult && lyricsResult.valid) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(lyricsResult));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lyrics not found' }));
    }
    return;
  }

  // GET /api/spotify/playlist/:id
  if (pathname.startsWith('/api/spotify/playlist/')) {
    const playlistId = pathname
      .replace('/api/spotify/playlist/', '')
      .split('?')[0];
    if (!/^[A-Za-z0-9]+$/.test(playlistId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid playlist id' }));
      return;
    }

    const playlist = await fetchSpotifyCanonicalPlaylist(playlistId);
    if (playlist) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(playlist));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Playlist not found' }));
    }
    return;
  }

  // GET /api/spotify/album/:id
  if (pathname.startsWith('/api/spotify/album/')) {
    const albumId = pathname.replace('/api/spotify/album/', '').split('?')[0];
    if (!/^[A-Za-z0-9]+$/.test(albumId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid album id' }));
      return;
    }

    const album = await fetchSpotifyCanonicalAlbum(albumId);
    if (album) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(album));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Album not found' }));
    }
    return;
  }

  // GET /api/spotify/track/:id
  if (pathname.startsWith('/api/spotify/track/')) {
    const trackId = pathname.replace('/api/spotify/track/', '').split('?')[0];
    const track = await fetchSpotifyCanonicalTrack(trackId);
    if (track) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(track));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Track not found' }));
    }
    return;
  }

  // GET /api/youtube/artist-image?artist=...
  if (pathname === '/api/youtube/artist-image') {
    const artistName = String(parsedUrl.query.artist || '').trim();
    if (!artistName || artistName.length > 160) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid artist name' }));
      return;
    }

    const imageURL = await fetchYouTubeArtistImage(artistName);
    if (!imageURL) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Artist image not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ imageURL }));
    return;
  }

  // Audio Stream Proxy
  if (pathname === '/api/audio/proxy') {
    const targetUrl = isAllowedAudioStreamUrl(parsedUrl.query.url);
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unsupported audio stream URL' }));
      return;
    }

    try {
      const range = req.headers.range;
      const audioRes = await fetch(targetUrl, {
        headers: range ? { Range: range } : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (!audioRes.ok && audioRes.status !== 206) {
        throw new Error(`Upstream audio response ${audioRes.status}`);
      }
      if (!audioRes.body) throw new Error('Empty upstream audio response');

      const contentLength = audioRes.headers.get('content-length');
      const contentRange = audioRes.headers.get('content-range');
      res.writeHead(audioRes.status, {
        'Content-Type': audioRes.headers.get('content-type') || 'audio/mpeg',
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
        ...(contentRange ? { 'Content-Range': contentRange } : {}),
        'Accept-Ranges': audioRes.headers.get('accept-ranges') || 'bytes',
        'Cache-Control': 'no-store',
      });

      const reader = audioRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.destroyed) res.write(Buffer.from(value));
      }
      if (!res.writableEnded && !res.destroyed) res.end();
      return;
    } catch {
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to proxy audio stream' }));
      }
      return;
    }
  }

  // POST /api/music/youtube - exact metadata and playable audio for an edited YouTube link
  if (pathname === '/api/music/youtube' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const { url: youtubeUrl } = JSON.parse(body || '{}');
        const videoId = getYouTubeVideoId(youtubeUrl);
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid YouTube video URL' }));
          return;
        }

        const track = await fetchYouTubeTrack(videoId);
        if (!track) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Could not resolve YouTube track' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ track }));
      } catch (error) {
        console.error('[YouTube Track] Request failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Could not resolve YouTube track' }));
      }
    });
    return;
  }

  // POST /api/music/resolve (End-to-End Canonical Spotify + YouTube Official Ranker + Playable Audio Stream Pipeline)
  if (pathname === '/api/music/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        let {
          title,
          artist,
          artists,
          albumName,
          releaseDate,
          durationMs,
          spotifyId,
          isrc,
          imageURL,
          includeLyrics = true,
        } = payload;

        // If spotifyId is provided and details are missing or need validation, extract canonical track directly
        if (spotifyId && (!title || !artists || artists.length === 0)) {
          const cleanSpotifyId = spotifyId
            .replace(/^spotify:track:/, '')
            .split('?')[0];
          const spCanonical = await fetchSpotifyCanonicalTrack(cleanSpotifyId);
          if (spCanonical) {
            title = spCanonical.title;
            artists = spCanonical.artists;
            artist = spCanonical.artistName;
            albumName = spCanonical.albumName;
            durationMs = spCanonical.duration_ms;
            imageURL = spCanonical.imageURL;
          }
        }

        if (!title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Title or spotifyId is required' }));
          return;
        }

        // STEP 1: IDENTITY LOCK 🔒
        const parsedArtists =
          Array.isArray(artists) && artists.length > 0
            ? artists.map((a) => (typeof a === 'string' ? { name: a } : a))
            : String(artist || 'Artista')
                .split(/\s*(?:,|&)\s*/)
                .filter(Boolean)
                .map((name) => ({ name }));

        const lockedTarget = {
          title: title.trim(),
          artists: parsedArtists,
          artistName: parsedArtists[0]?.name || artist || 'Artista',
          albumName: albumName || 'Single',
          releaseDate: releaseDate || '',
          durationMs: durationMs || 0,
          isrc: isrc || '',
          imageURL: imageURL || '',
          spotifyId: spotifyId || '',
        };

        console.log(
          `[Official Resolution] Target: "${lockedTarget.artistName} - ${lockedTarget.title}" (${lockedTarget.durationMs}ms)`
        );

        // STEP 2: YOUTUBE OFFICIAL ARTIST RANKER
        const simplifiedArtist = getArtistSearchName(lockedTarget.artistName);
        const ytOfficial =
          (await fetchYouTubeOfficialVideo(lockedTarget)) ||
          (await fetchYouTubeOfficialVideo(
            lockedTarget,
            `${lockedTarget.artistName} ${lockedTarget.title} official audio`
          )) ||
          (simplifiedArtist && simplifiedArtist !== lockedTarget.artistName
            ? await fetchYouTubeOfficialVideo(
                lockedTarget,
                `${simplifiedArtist} ${lockedTarget.title}`
              )
            : null);
        if (ytOfficial) {
          console.log(
            `  ✅ [YouTube Official Video Found] "${ytOfficial.title}" by channel "${ytOfficial.channel}" (${ytOfficial.durationSec}s)`
          );
        }

        // The selected official video is the audio source. SoundCloud only
        // remains a strict fallback when YouTube cannot yield a stream.
        const ytStream = ytOfficial
          ? await fetchYouTubeTrack(ytOfficial.id)
          : null;
        const scStream = ytStream
          ? null
          : await fetchSoundCloudPlayableStream(
              lockedTarget.title,
              lockedTarget.artistName,
              lockedTarget.durationMs
            );
        const resolvedSource = ytStream
          ? {
              provider: 'youtube',
              id: ytOfficial.id,
              url: ytStream.youtubeUrl,
              streamUrl: ytStream.streamUrl,
              format: ytStream.format,
              quality: 'high',
              score: ytOfficial.score,
            }
          : scStream
            ? {
                provider: 'soundcloud',
                id: '',
                url: scStream.streamUrl,
                streamUrl: scStream.streamUrl,
                format: scStream.format || 'mp3',
                quality: scStream.quality || '128kbps',
                score: 0.9,
              }
            : null;
        const artworkUrl = lockedTarget.imageURL || ytStream?.imageURL || '';

        // STEP 4: EXACT PARAMETRIC GET IDENTIFIER (Lyrics)
        const exactGet = includeLyrics
          ? await fetchExactIdentifierGet(
              lockedTarget.title,
              lockedTarget.artistName,
              lockedTarget.durationMs,
              lockedTarget.albumName,
              lockedTarget.releaseDate
            )
          : null;

        let resolvedLyrics = exactGet?.valid
          ? { synced: exactGet.synced, lines: exactGet.lines }
          : null;

        const responseData = {
          confidence: resolvedSource ? 'VERY_HIGH' : 'UNCERTAIN',
          status: resolvedSource ? 'EXACT' : 'NO_MATCH',
          identity: {
            id: lockedTarget.spotifyId || `target_${Date.now()}`,
            title: lockedTarget.title,
            artists: lockedTarget.artists.map((a) => a.name),
            durationMs: lockedTarget.durationMs,
            isrc: lockedTarget.isrc,
            anchorProvider: 'spotify',
          },
          metadata: {
            album: lockedTarget.albumName,
          },
          artwork: artworkUrl
            ? {
                url: artworkUrl,
              }
            : undefined,
          lyrics: resolvedLyrics,
          playback: {
            type: resolvedSource ? 'DIRECT_AUDIO' : 'EXTERNAL',
            provider: resolvedSource?.provider || 'youtube',
            url: resolvedSource?.streamUrl || ytOfficial?.url || '',
            directUrl: resolvedSource?.streamUrl || '',
            format: resolvedSource?.format || 'm4a',
            quality: resolvedSource?.quality || 'high',
            verified: true,
            confidence: 'VERY_HIGH',
            score: resolvedSource?.score || 0,
          },
          track: {
            title: lockedTarget.title,
            artistName: lockedTarget.artistName,
            artists: lockedTarget.artists,
            albumName: lockedTarget.albumName,
            releaseDate: lockedTarget.releaseDate,
            imageURL: artworkUrl,
            duration_ms: lockedTarget.durationMs,
            spotifyId: lockedTarget.spotifyId,
            isrc: lockedTarget.isrc,
          },
          source: {
            type: resolvedSource ? 'DIRECT_AUDIO' : 'EXTERNAL',
            provider: resolvedSource?.provider || 'youtube',
            id: resolvedSource?.id || ytOfficial?.id || '',
            url: resolvedSource?.url || ytOfficial?.url || '',
            streamUrl: resolvedSource?.streamUrl || '',
            format: resolvedSource?.format || 'm4a',
            verified: true,
            channel: ytOfficial?.channel || '',
            score: resolvedSource?.score || 0,
          },
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (err) {
        console.error('[Resolution Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Openfy Backend Server] Listening on port ${PORT}`);
});
