/**
 * Openfy Music Resolution Backend Server
 * High-performance, CORS-free Node.js API with StrictTrackMatcher Anti-Guessing Engine.
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

// Normalization
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

const FORBIDDEN_VERSION_TAGS = [
  { tag: 'live', reason: 'LIVE_VERSION' },
  { tag: 'concert', reason: 'LIVE_VERSION' },
  { tag: 'ao vivo', reason: 'LIVE_VERSION' },
  { tag: 'acoustic', reason: 'ACOUSTIC_VERSION' },
  { tag: 'acustico', reason: 'ACOUSTIC_VERSION' },
  { tag: 'unplugged', reason: 'ACOUSTIC_VERSION' },
  { tag: 'remix', reason: 'REMIX' },
  { tag: 'rework', reason: 'REMIX' },
  { tag: 'sped up', reason: 'SPED_UP' },
  { tag: 'speed up', reason: 'SPED_UP' },
  { tag: 'nightcore', reason: 'SPED_UP' },
  { tag: 'slowed', reason: 'SLOWED' },
  { tag: 'reverb', reason: 'SLOWED' },
  { tag: 'slowed+reverb', reason: 'SLOWED' },
  { tag: 'cover', reason: 'COVER' },
  { tag: 'tribute', reason: 'COVER' },
  { tag: 'karaoke', reason: 'COVER' },
  { tag: 'instrumental', reason: 'INSTRUMENTAL' },
  { tag: '10 hour', reason: 'COMPILATION_OR_LOOP' },
  { tag: '1 hour', reason: 'COMPILATION_OR_LOOP' },
  { tag: 'loop', reason: 'COMPILATION_OR_LOOP' },
];

/**
 * StrictTrackMatcher Core Evaluator
 */
function evaluateCandidateStrict(target, candidate) {
  const cTitle = (candidate.title || '').toLowerCase();
  const tTitle = (target.title || '').toLowerCase();

  // 1. Snippet filter
  if (candidate.durationMs && candidate.durationMs < 45000) {
    return { confidence: 'REJECTED', reason: 'SNIPPET' };
  }

  // 2. Strict duration delta filter (<= 3000ms)
  let durationDiffMs = 0;
  if (target.durationMs && target.durationMs > 0 && candidate.durationMs && candidate.durationMs > 0) {
    durationDiffMs = Math.abs(candidate.durationMs - target.durationMs);
    if (durationDiffMs > 3000) {
      return { confidence: 'REJECTED', reason: `DURATION_MISMATCH (${durationDiffMs}ms > 3000ms)` };
    }
  }

  // 3. Version tag mismatch filter
  for (const entry of FORBIDDEN_VERSION_TAGS) {
    const candidateHasTag = cTitle.includes(entry.tag);
    const targetHasTag = tTitle.includes(entry.tag);
    if (candidateHasTag && !targetHasTag) {
      return { confidence: 'REJECTED', reason: entry.reason };
    }
  }

  // 4. Official uploader & title match
  const targetArtistNorm = normalizeText(target.artists?.[0]?.name || '');
  const candAuthorNorm = normalizeText(candidate.author || candidate.artist || '');
  const candTitleNorm = normalizeText(candidate.title || '');
  const targetTitleNorm = normalizeText(target.title || '');

  const isOfficialChannel =
    targetArtistNorm &&
    (candAuthorNorm.includes(targetArtistNorm) ||
      candAuthorNorm.includes('vevo') ||
      candAuthorNorm.includes('topic') ||
      candAuthorNorm.includes('records'));

  const titleMatches =
    candTitleNorm.includes(targetTitleNorm) ||
    targetTitleNorm.includes(candTitleNorm);

  if (target.isrc && candidate.isrc && target.isrc === candidate.isrc && durationDiffMs <= 2000) {
    return { confidence: 'PROVEN', score: 1.0, canAutoPlay: true, durationDiffMs };
  }

  if (isOfficialChannel && titleMatches && durationDiffMs <= 3000) {
    return { confidence: 'VERY_HIGH', score: 0.92, canAutoPlay: true, durationDiffMs };
  }

  if (titleMatches && durationDiffMs <= 2000) {
    return { confidence: 'HIGH', score: 0.85, canAutoPlay: false, durationDiffMs };
  }

  return { confidence: 'UNCERTAIN', score: 0.5, canAutoPlay: false, durationDiffMs };
}

// Metadata Provider: Deezer Search
async function fetchDeezerMetadata(query) {
  const cacheKey = `deezer:${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`);
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.data?.[0];
    if (item) {
      const result = {
        title: item.title,
        artists: [{ name: item.artist?.name || 'Artista' }],
        album: { name: item.album?.title || 'Deezer' },
        durationMs: (item.duration || 0) * 1000,
        artwork: { url: item.album?.cover_big || item.album?.cover_medium || '' },
        isrc: item.isrc || '',
        sources: [{ provider: 'deezer', id: String(item.id) }]
      };
      setCache(cacheKey, result, 86400);
      return result;
    }
  } catch (e) {
    console.warn('[Deezer] fetch error:', e.message);
  }
  return null;
}

// Audio Provider: SoundCloud with Strict Verification
async function fetchSoundCloudCandidate(title, artist, canonicalDurationMs, isrc) {
  const clientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';
  const query = `${artist} - ${title}`;
  const cacheKey = `sc:${query}:${canonicalDurationMs}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=12`);
    if (!res.ok) return null;
    const data = await res.json();

    const candidates = [];
    for (const item of data.collection || []) {
      const decision = evaluateCandidateStrict(
        { title, artists: [{ name: artist }], durationMs: canonicalDurationMs, isrc },
        { title: item.title, author: item.user?.username, artist: item.user?.username, durationMs: item.duration }
      );

      if (decision.canAutoPlay) {
        const transcodings = (item.media?.transcodings || []).filter(t => !t.format?.protocol?.includes('encrypted'));
        const progressive = transcodings.find(t => t.format?.protocol === 'progressive') || transcodings[0];
        if (progressive?.url) {
          candidates.push({ item, decision, streamEndpoint: progressive.url });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.decision.score || 0) - (a.decision.score || 0));
      const top = candidates[0];

      // Resolve stream URL
      const sRes = await fetch(`${top.streamEndpoint}?client_id=${clientId}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.url) {
          const result = {
            url: sData.url,
            format: 'mp3',
            quality: '128kbps',
            confidence: top.decision.confidence,
            verified: true,
            score: top.decision.score,
            sourceTitle: top.item.title,
            sourceArtist: top.item.user?.username,
          };
          setCache(cacheKey, result, 300); // 5 min TTL for audio streams
          return result;
        }
      }
    }
  } catch (e) {
    console.warn('[SoundCloud] fetch error:', e.message);
  }
  return null;
}

// Lyrics Provider: Synchronized Lyrics
async function fetchLyrics(title, artist) {
  const cacheKey = `lyrics:${artist}:${title}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) {
        const lines = data.syncedLyrics.split('\n').filter(Boolean).map(l => {
          const m = l.match(/\[(\d+):(\d+\.\d+)\](.*)/);
          if (!m) return null;
          const startMs = (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000;
          return { text: m[3].trim(), startMs: Math.round(startMs) };
        }).filter(Boolean);

        const result = { synced: true, lines, source: 'lrclib' };
        setCache(cacheKey, result, 604800); // 7 days TTL
        return result;
      }
    }
  } catch (e) {
    console.warn('[Lyrics] fetch error:', e.message);
  }
  return null;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Enable CORS
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
    res.end(JSON.stringify({ status: 'ok', service: 'openfy-music-resolution-engine', time: new Date().toISOString() }));
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

  // POST /api/music/resolve
  if (pathname === '/api/music/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { title, artist, durationMs, spotifyId, isrc } = payload;

        if (!title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Title is required' }));
          return;
        }

        console.log(`[Strict Track Resolution] Resolving: "${artist || ''} - ${title}" (${durationMs || 0}ms)`);

        // 1. Resolve Canonical Target Identity
        let meta = await fetchDeezerMetadata(`${artist || ''} ${title}`);
        if (!meta) {
          meta = {
            title,
            artists: [{ name: artist || 'Artista' }],
            durationMs: durationMs || 0,
            album: { name: 'Single' },
            isrc: isrc || '',
            sources: []
          };
        }

        const primaryArtist = meta.artists[0]?.name || artist || '';
        const canonDuration = meta.durationMs || durationMs || 0;
        const targetISRC = meta.isrc || isrc || '';

        // 2. Strict Match against candidates (requires PROVEN or VERY_HIGH)
        const audioSource = await fetchSoundCloudCandidate(meta.title, primaryArtist, canonDuration, targetISRC);

        // 3. Resolve Synchronized Lyrics
        const lyrics = await fetchLyrics(meta.title, primaryArtist);

        const responseData = {
          confidence: audioSource ? audioSource.confidence : 'UNCERTAIN',
          status: audioSource ? 'EXACT' : 'NO_MATCH',
          track: {
            title: meta.title,
            artistName: primaryArtist,
            albumName: meta.album?.name || 'Single',
            imageURL: meta.artwork?.url || '',
            duration_ms: canonDuration,
            spotifyId: spotifyId || '',
            isrc: targetISRC,
          },
          source: audioSource ? {
            type: 'DIRECT_AUDIO',
            url: `http://localhost:${PORT}/api/audio/proxy?url=${encodeURIComponent(audioSource.url)}`,
            directUrl: audioSource.url,
            format: audioSource.format,
            quality: audioSource.quality,
            verified: true,
            score: audioSource.score
          } : null,
          lyrics,
          reason: audioSource
            ? 'Identity proven with strict duration and verified artist channel'
            : 'No candidate met strict PROVEN/VERY_HIGH thresholds. Auto-play prevented.',
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (err) {
        console.error('[Strict Resolution Error]:', err);
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
  console.log(`🚀 [Openfy Strict Resolution Server] Running on http://localhost:${PORT}`);
});
