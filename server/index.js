/**
 * Openfy Music Resolution Backend Server
 * High-performance, CORS-free Node.js API for Music Identity Matching & Stream Resolution.
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

// String Normalization
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

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    for (let j = 1; j <= b.length; j++) {
      const val = Math.min(prev[j] + 1, curr + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev[j - 1] = curr;
      curr = val;
    }
    prev[b.length] = curr;
  }
  return prev[b.length];
}

function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const aa = a.split(' ').filter(Boolean);
  const bb = new Set(b.split(' ').filter(Boolean));
  const inter = aa.filter(t => bb.has(t)).length;
  const union = new Set([...aa, ...bb]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return lev * 0.65 + jaccard * 0.35;
}

// Match Evaluator
function evaluateCandidate(candidate, canonical) {
  const cTitle = (candidate.title || '').toLowerCase();
  const oTitle = (canonical.title || '').toLowerCase();
  const cAuthor = (candidate.artist || candidate.author || '').toLowerCase();
  const primaryArtist = canonical.artists[0]?.name || '';

  const FORBIDDEN = ['slowed', 'speed up', 'sped up', 'bassboost', '10 hour', '1 hour', 'loop', '8d audio'];
  for (const f of FORBIDDEN) {
    if (cTitle.includes(f) && !oTitle.includes(f)) {
      return { score: 0, status: 'NO_MATCH', reason: `Forbidden word: ${f}` };
    }
  }

  const candSec = (candidate.durationMs || 0) / 1000;
  const canonSec = (canonical.durationMs || 0) / 1000;
  if (candSec < 45) return { score: 0, status: 'NO_MATCH', reason: 'Snippet < 45s' };

  let diffSec = 0;
  let durScore = 0.7;
  if (canonSec > 0) {
    diffSec = Math.abs(candSec - canonSec);
    if (diffSec > 40) return { score: 0, status: 'NO_MATCH', reason: `Duration mismatch (${diffSec}s)` };
    durScore = Math.max(0.4, 1 - diffSec * 0.02);
  }

  const normCand = normalizeText(candidate.title);
  const normCanon = normalizeText(canonical.title);
  const normArt = normalizeText(primaryArtist);

  const titleScore = similarity(normCand, normCanon);
  let artistScore = 0.5;
  if (normArt) {
    artistScore = cAuthor.includes(normArt) || normCand.includes(normArt) ? 1 : similarity(normArt, cAuthor);
  }

  const isOfficial = normArt && (cAuthor.includes(normArt) || cAuthor.includes('topic') || cAuthor.includes('vevo'));
  const softPenalty = ['remix', 'cover', 'edit', 'acoustic', 'live'].some(w => cTitle.includes(w) && !oTitle.includes(w)) ? 0.35 : 0;

  let total = durScore * 0.35 + titleScore * 0.35 + artistScore * 0.3 + (isOfficial ? 0.15 : 0) - softPenalty;
  total = Math.min(1, Math.max(0, total));

  const status = total >= 0.88 ? 'EXACT' : total >= 0.75 ? 'HIGH_CONFIDENCE' : total >= 0.5 ? 'AMBIGUOUS' : 'NO_MATCH';
  return { score: Math.round(total * 100) / 100, status, diffSec };
}

// Provider: Deezer Search
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

// Provider: SoundCloud Search & Stream
async function fetchSoundCloudCandidate(title, artist, canonicalDurationMs) {
  const clientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';
  const query = `${artist} - ${title}`;
  const cacheKey = `sc:${query}:${canonicalDurationMs}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=10`);
    if (!res.ok) return null;
    const data = await res.json();

    const candidates = [];
    for (const item of data.collection || []) {
      const match = evaluateCandidate(
        { title: item.title, artist: item.user?.username, durationMs: item.duration },
        { title, artists: [{ name: artist }], durationMs: canonicalDurationMs }
      );

      if (match.status === 'EXACT' || match.status === 'HIGH_CONFIDENCE') {
        const transcodings = (item.media?.transcodings || []).filter(t => !t.format?.protocol?.includes('encrypted'));
        const progressive = transcodings.find(t => t.format?.protocol === 'progressive') || transcodings[0];
        if (progressive?.url) {
          candidates.push({ item, match, streamEndpoint: progressive.url });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.match.score - a.match.score);
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
            verified: true,
            score: top.match.score,
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

// Provider: Synchronized Lyrics
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

  // Audio Stream Proxy (Eliminates CORS on Web completely)
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
        const { title, artist, durationMs, spotifyId } = payload;

        if (!title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Title is required' }));
          return;
        }

        console.log(`[Backend Resolution] Resolving: "${artist || ''} - ${title}" (${durationMs || 0}ms)`);

        // 1. Resolve Canonical Metadata
        let meta = await fetchDeezerMetadata(`${artist || ''} ${title}`);
        if (!meta) {
          meta = {
            title,
            artists: [{ name: artist || 'Artista' }],
            durationMs: durationMs || 0,
            album: { name: 'Single' },
            sources: []
          };
        }

        const primaryArtist = meta.artists[0]?.name || artist || '';
        const canonDuration = meta.durationMs || durationMs || 0;

        // 2. Resolve Verified Audio Stream
        const audioSource = await fetchSoundCloudCandidate(meta.title, primaryArtist, canonDuration);

        // 3. Resolve Synchronized Lyrics
        const lyrics = await fetchLyrics(meta.title, primaryArtist);

        const responseData = {
          status: audioSource ? 'EXACT' : 'NO_MATCH',
          track: {
            title: meta.title,
            artistName: primaryArtist,
            albumName: meta.album?.name || 'Single',
            imageURL: meta.artwork?.url || '',
            duration_ms: canonDuration,
            spotifyId: spotifyId || '',
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
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (err) {
        console.error('[Backend Resolution Error]:', err);
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
  console.log(`🚀 [Openfy Resolution Server] Running on http://localhost:${PORT}`);
});
