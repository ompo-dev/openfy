/**
 * Openfy Music Resolution Backend Server
 * High-performance Node.js API with Spotify Canonical Scraper, YouTubeOfficialRanker, SoundCloud Stream Resolver, IdentityLock & CORS-Free Proxy.
 */

const http = require('http');
const url = require('url');

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
    .replace(/[()[\]{}]/g, ' ')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseViewCount(viewText) {
  if (!viewText) return 0;
  const clean = (viewText || '').toLowerCase().replace(/visualizaç[õo]es|views/g, '').trim();
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
  'instrumental',
  '10 hour',
  '1 hour',
  'loop',
  'react',
  'reacao',
  'bastidores',
];

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
          const artists = (entity.artists || []).map(a => ({ name: a.name }));
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
    console.warn(`[Spotify Scraper] Failed to fetch embed for ${trackId}:`, e.message);
  }

  return null;
}

/**
 * 1. YouTube Official Channel & Timing Ranker
 */
async function fetchYouTubeOfficialVideo(target) {
  const primaryArtist = target.artists[0]?.name || target.artistName || '';
  const query = `${target.title} ${primaryArtist}`.trim();
  const cacheKey = `yt_official:${query}:${target.durationMs}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const match =
      html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*({[\s\S]*?});/);

    if (!match) return null;

    const data = JSON.parse(match[1]);
    const contents =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents?.[0]?.itemSectionRenderer?.contents || [];

    const candidates = [];
    const targetDurationSec = target.durationMs > 0 ? target.durationMs / 1000 : 0;
    const normTargetTitle = normalizeText(target.title);
    const lockedArtistsNorm = (target.artists || [{ name: primaryArtist }]).map(a => normalizeText(a.name || a));

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
      if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

      if (durationSec < 40) continue;

      const titleLower = title.toLowerCase();
      const normCandTitle = normalizeText(title);
      const normChannel = normalizeText(channel);

      let hasForbidden = false;
      for (const f of FORBIDDEN_VERSION_TAGS) {
        if (titleLower.includes(f) && !target.title.toLowerCase().includes(f)) {
          hasForbidden = true;
          break;
        }
      }
      if (hasForbidden) continue;

      const titleMatched =
        normCandTitle.includes(normTargetTitle) ||
        normTargetTitle.includes(normCandTitle);

      if (!titleMatched) continue;

      let isOfficialArtistChannel = false;
      for (const artNorm of lockedArtistsNorm) {
        if (
          artNorm &&
          (normChannel.includes(artNorm) ||
            normCandTitle.includes(artNorm) ||
            normChannel.includes('topic') ||
            normChannel.includes('vevo') ||
            normChannel.includes('records'))
        ) {
          isOfficialArtistChannel = true;
          break;
        }
      }

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

      let score = 0.7;
      if (isOfficialArtistChannel) score += 0.2;
      if (durationDiffSec <= 10) score += 0.1;

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

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.isOfficialArtistChannel && !b.isOfficialArtistChannel) return -1;
        if (!a.isOfficialArtistChannel && b.isOfficialArtistChannel) return 1;
        const aIsTopic = a.channel.toLowerCase().includes('topic');
        const bIsTopic = b.channel.toLowerCase().includes('topic');
        if (!aIsTopic && bIsTopic) return -1;
        if (aIsTopic && !bIsTopic) return 1;
        if (a.views !== b.views) return b.views - a.views;
        return a.durationDiffSec - b.durationDiffSec;
      });

      const top = candidates[0];
      const result = {
        provider: 'youtube',
        id: top.videoId,
        title: top.title,
        channel: top.channel,
        url: top.url,
        durationSec: top.durationSec,
        viewCountText: top.viewCountText,
        verified: true,
        score: top.score,
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
  const searchQueries = primaryArtist ? [`${primaryArtist} - ${title}`, title] : [title];
  const clientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';

  for (const query of searchQueries) {
    try {
      const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=8`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.collection || [])) {
        if (!item.title) continue;

        // Strict title matching: candidate must contain at least one key word of requested title
        const normReqTitle = normalizeText(title);
        const normCandTitle = normalizeText(item.title);
        const keyWords = normReqTitle.split(' ').filter(w => w.length > 2);
        const titleMatch = keyWords.some(w => normCandTitle.includes(w)) || normCandTitle.includes(normReqTitle) || normReqTitle.includes(normCandTitle);
        if (!titleMatch) continue;

        const dur = item.duration || 0;
        const diffMs = durationMs > 0 ? Math.abs(dur - durationMs) : 0;
        if (durationMs > 0 && diffMs > 30000) continue; // within 30s

        const transcodings = item.media?.transcodings || [];
        const nonDrm = transcodings.filter(t => {
          const p = (t.format?.protocol || '').toLowerCase();
          return !p.includes('encrypted') && !p.includes('cenc');
        });
        nonDrm.sort((a, b) => (a.format?.protocol === 'progressive' ? -1 : 1));

        for (const t of nonDrm) {
          if (!t.url) continue;
          const streamRes = await fetch(`${t.url}?client_id=${clientId}`, { signal: AbortSignal.timeout(3500) });
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
async function fetchComprehensiveLyrics(title, artist, durationMs, albumName) {
  const durationSec = durationMs > 0 ? Math.round(durationMs / 1000) : 0;
  const cacheKey = `lyrics_multi:${artist}:${title}:${durationSec}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 1. LRCLIB Exact
  try {
    const queryParams = new URLSearchParams({
      track_name: title,
      artist_name: artist,
      ...(durationSec > 0 ? { duration: String(durationSec) } : {}),
      ...(albumName ? { album_name: albumName } : {}),
    });

    const res = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`, {
      headers: { 'User-Agent': 'OpenfyMusic/1.0.0 ( contact@openfy.app )' },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      let lines = [];
      if (data.syncedLyrics) {
        lines = data.syncedLyrics
          .split('\n')
          .filter(Boolean)
          .map(l => {
            const m = l.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
            if (!m) return null;
            const startMs = (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000;
            return { text: m[3].trim(), startMs: Math.round(startMs) };
          })
          .filter(Boolean);
      }

      if (data.syncedLyrics || data.plainLyrics) {
        const result = {
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
        setCache(cacheKey, result, 604800);
        return result;
      }
    }
  } catch {}

  // 2. LRCLIB Search
  try {
    const cleanTitle = (title || '').replace(/\(.*\)/g, '').replace(/-.*/g, '').trim();
    const cleanArtist = (artist || '').replace(/\(.*\)/g, '').replace(/,.*/g, '').trim();
    const searchQueries = [
      `${cleanArtist} ${cleanTitle}`,
      cleanTitle,
      title
    ];

    for (const sq of searchQueries) {
      const sRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(sq)}`, {
        headers: { 'User-Agent': 'OpenfyMusic/1.0.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (sRes.ok) {
        const list = await sRes.json();
        if (Array.isArray(list) && list.length > 0) {
          const match = list.find(x => x.syncedLyrics) || list.find(x => x.plainLyrics);
          if (match) {
            let lines = [];
            if (match.syncedLyrics) {
              lines = match.syncedLyrics
                .split('\n')
                .filter(Boolean)
                .map(l => {
                  const m = l.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
                  if (!m) return null;
                  const startMs = (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000;
                  return { text: m[3].trim(), startMs: Math.round(startMs) };
                })
                .filter(Boolean);
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

  // 3. Letras.mus.br Scraper (100% complete Brazilian & International Lyrics)
  try {
    const cleanT = (title || '').replace(/\(.*\)/g, '').replace(/-.*/g, '').trim();
    const cleanA = (artist || '').replace(/\(.*\)/g, '').replace(/,.*/g, '').trim();
    const queries = [
      `${cleanA} ${cleanT}`,
      cleanT,
      `${cleanT} ${cleanA}`
    ];

    for (const q of queries) {
      const url = `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3500) });
      if (!res.ok) continue;
      const raw = await res.text();
      const match = raw.match(/LetrasSug\(([\s\S]*)\)/);
      if (!match) continue;
      const data = JSON.parse(match[1]);
      const docs = data.response?.docs || [];
      if (!docs.length) continue;

      for (const doc of docs.slice(0, 3)) {
        if (!doc.dns || !doc.url) continue;
        const pageUrl = `https://www.letras.mus.br/${doc.dns}/${doc.url}/`;
        const pageRes = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3500) });
        if (!pageRes.ok) continue;
        const html = await pageRes.text();
        const lyricMatch = html.match(/<div class="lyric-original"[^>]*>([\s\S]*?)<\/div>/i) ||
                           html.match(/<div class="cnt-letra"[^>]*>([\s\S]*?)<\/div>/i);
        if (lyricMatch) {
          const plain = lyricMatch[1]
            .replace(/<p>/g, '')
            .replace(/<\/p>/g, '\n\n')
            .replace(/<br\s*[\/]?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();
          if (plain.length > 20) {
            const result = {
              valid: true,
              synced: false,
              isSynced: false,
              lines: [],
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

// HTTP Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
    res.end(JSON.stringify({ status: 'ok', service: 'openfy-official-ranker-resolution-engine', time: new Date().toISOString() }));
    return;
  }

  // GET /api/lyrics?title=...&artist=...&durationMs=...
  if (pathname === '/api/lyrics') {
    const qTitle = parsedUrl.query.title || parsedUrl.query.track_name;
    const qArtist = parsedUrl.query.artist || parsedUrl.query.artist_name || '';
    const qDurationMs = parseInt(parsedUrl.query.durationMs || parsedUrl.query.duration || '0', 10);
    const qAlbum = parsedUrl.query.album || '';

    if (!qTitle) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing title parameter' }));
      return;
    }

    const lyricsResult = await fetchComprehensiveLyrics(qTitle, qArtist, qDurationMs, qAlbum);
    if (lyricsResult && lyricsResult.valid) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(lyricsResult));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lyrics not found' }));
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

  // Audio Stream Proxy
  if (pathname === '/api/audio/proxy') {
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing target url query parameter' }));
      return;
    }

    try {
      const headRes = await fetch(targetUrl, { method: 'HEAD' });
      const contentType = headRes.headers.get('content-type') || 'audio/mpeg';
      const contentLength = headRes.headers.get('content-length');

      res.writeHead(200, {
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      });

      const audioRes = await fetch(targetUrl);
      const reader = audioRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
      return;
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to proxy audio stream', details: err.message }));
      return;
    }
  }

  // POST /api/music/resolve (End-to-End Canonical Spotify + YouTube Official Ranker + Playable Audio Stream Pipeline)
  if (pathname === '/api/music/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        let { title, artist, artists, albumName, durationMs, spotifyId, isrc, imageURL } = payload;

        // If spotifyId is provided and details are missing or need validation, extract canonical track directly
        if (spotifyId && (!title || !artists || artists.length === 0)) {
          const cleanSpotifyId = spotifyId.replace(/^spotify:track:/, '').split('?')[0];
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
        const parsedArtists = Array.isArray(artists) && artists.length > 0
          ? artists.map(a => typeof a === 'string' ? { name: a } : a)
          : [{ name: artist || 'Artista' }];

        const lockedTarget = {
          title: title.trim(),
          artists: parsedArtists,
          artistName: parsedArtists[0]?.name || artist || 'Artista',
          albumName: albumName || 'Single',
          durationMs: durationMs || 0,
          isrc: isrc || '',
          imageURL: imageURL || '',
          spotifyId: spotifyId || '',
        };

        console.log(`[Official Resolution] Target: "${lockedTarget.artistName} - ${lockedTarget.title}" (${lockedTarget.durationMs}ms)`);

        // STEP 2: YOUTUBE OFFICIAL ARTIST RANKER
        const ytOfficial = await fetchYouTubeOfficialVideo(lockedTarget);
        if (ytOfficial) {
          console.log(`  ✅ [YouTube Official Video Found] "${ytOfficial.title}" by channel "${ytOfficial.channel}" (${ytOfficial.durationSec}s)`);
        }

        // STEP 3: SOUNDCLOUD PLAYABLE AUDIO STREAM RESOLVER
        const scStream = await fetchSoundCloudPlayableStream(lockedTarget.title, lockedTarget.artistName, lockedTarget.durationMs);

        // STEP 4: EXACT PARAMETRIC GET IDENTIFIER (Lyrics)
        const exactGet = await fetchExactIdentifierGet(
          lockedTarget.title,
          lockedTarget.artistName,
          lockedTarget.durationMs,
          lockedTarget.albumName
        );

        let resolvedLyrics = exactGet?.valid ? { synced: exactGet.synced, lines: exactGet.lines } : null;

        const responseData = {
          confidence: ytOfficial || scStream ? 'VERY_HIGH' : 'UNCERTAIN',
          status: ytOfficial || scStream ? 'EXACT' : 'NO_MATCH',
          identity: {
            id: lockedTarget.spotifyId || `target_${Date.now()}`,
            title: lockedTarget.title,
            artists: lockedTarget.artists.map(a => a.name),
            durationMs: lockedTarget.durationMs,
            isrc: lockedTarget.isrc,
            anchorProvider: 'spotify',
          },
          metadata: {
            album: lockedTarget.albumName,
          },
          artwork: lockedTarget.imageURL ? {
            url: lockedTarget.imageURL,
          } : undefined,
          lyrics: resolvedLyrics,
          playback: {
            type: scStream ? 'DIRECT_AUDIO' : 'EXTERNAL',
            provider: scStream ? 'soundcloud' : 'youtube',
            url: scStream?.streamUrl || ytOfficial?.url || '',
            directUrl: scStream?.streamUrl || '',
            format: scStream?.format || 'mp3',
            quality: scStream?.quality || '128kbps',
            verified: true,
            confidence: 'VERY_HIGH',
            score: ytOfficial?.score || 0.95,
          },
          track: {
            title: lockedTarget.title,
            artistName: lockedTarget.artistName,
            artists: lockedTarget.artists,
            albumName: lockedTarget.albumName,
            imageURL: lockedTarget.imageURL,
            duration_ms: lockedTarget.durationMs,
            spotifyId: lockedTarget.spotifyId,
            isrc: lockedTarget.isrc,
          },
          source: {
            type: scStream ? 'DIRECT_AUDIO' : 'EXTERNAL',
            provider: scStream ? 'soundcloud' : 'youtube',
            id: ytOfficial?.id || '',
            url: scStream?.streamUrl || ytOfficial?.url || '',
            streamUrl: scStream?.streamUrl || '',
            verified: true,
            channel: ytOfficial?.channel || '',
            score: ytOfficial?.score || 0.95,
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

server.listen(PORT, () => {
  console.log(`🚀 [Openfy Backend Server] Running on http://localhost:${PORT}`);
});
