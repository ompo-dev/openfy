/**
 * Openfy Music Resolution Backend Server
 * High-performance Node.js API with Exact Identifier GET, IdentityLock, and Decoupled Canonical Model.
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

function slugify(text) {
  return (text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
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
];

/**
 * BooleanMatchGuard - Absolute boolean gates for candidate validation
 */
function evaluateBooleanGuard(target, candidate) {
  const candTitleLower = (candidate.title || '').toLowerCase();
  const targetTitleLower = (target.title || '').toLowerCase();

  // 1. Snippet filter
  if (candidate.durationMs && candidate.durationMs < 45000) {
    return { passed: false, confidence: 'REJECTED', reason: 'SNIPPET' };
  }

  // 2. Version gate
  for (const tag of FORBIDDEN_VERSION_TAGS) {
    if (candTitleLower.includes(tag) && !targetTitleLower.includes(tag)) {
      return { passed: false, confidence: 'REJECTED', reason: `VERSION_CONFLICT: ${tag}` };
    }
  }

  // 3. Duration gate (<= 3000ms strict tolerance)
  let durationDiffMs = 0;
  if (target.durationMs && target.durationMs > 0 && candidate.durationMs && candidate.durationMs > 0) {
    durationDiffMs = Math.abs(candidate.durationMs - target.durationMs);
    if (durationDiffMs > 3000) {
      return { passed: false, confidence: 'REJECTED', reason: `DURATION_MISMATCH: ${durationDiffMs}ms` };
    }
  }

  // 4. Artist gate
  const candAuthorNorm = normalizeText(candidate.author || candidate.artist || '');
  const candTitleNorm = normalizeText(candidate.title || '');
  const targetArtists = (target.artists || [{ name: target.artist || '' }]).map(a => normalizeText(a.name || a));

  let artistPassed = false;
  for (const art of targetArtists) {
    if (art && (candAuthorNorm.includes(art) || candTitleNorm.includes(art) || candAuthorNorm.includes('topic') || candAuthorNorm.includes('vevo'))) {
      artistPassed = true;
      break;
    }
  }

  if (!artistPassed && targetArtists.length > 0 && targetArtists[0] !== '') {
    return { passed: false, confidence: 'REJECTED', reason: 'ARTIST_MISMATCH' };
  }

  // 5. Title gate
  const normTargetTitle = normalizeText(target.title);
  const titlePassed = candTitleNorm.includes(normTargetTitle) || normTargetTitle.includes(candTitleNorm);
  if (!titlePassed) {
    return { passed: false, confidence: 'REJECTED', reason: 'TITLE_MISMATCH' };
  }

  const isOfficial = Boolean(candidate.isOfficialRelation || (target.isrc && candidate.isrc && target.isrc === candidate.isrc));
  const confidence = isOfficial && durationDiffMs <= 1500 ? 'PROVEN' : durationDiffMs <= 2000 ? 'VERY_HIGH' : 'HIGH';

  return { passed: true, confidence, durationDiffMs, score: isOfficial ? 1.0 : 0.92 };
}

// 1. STEP 1: Direct Parametric GET Identifier (track_name + artist_name + duration) with Strict Cross-Validation
async function fetchExactIdentifierGet(title, artist, durationMs, albumName) {
  const durationSec = durationMs > 0 ? Math.round(durationMs / 1000) : 0;
  const cacheKey = `exact_get:${artist}:${title}:${durationSec}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const queryParams = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    ...(durationSec > 0 ? { duration: String(durationSec) } : {}),
    ...(albumName ? { album_name: albumName } : {}),
  });

  try {
    const res = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`, {
      headers: { 'User-Agent': 'OpenfyMusic/1.0.0 ( contact@openfy.app )' },
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const data = await res.json();

      // Cross-validate response against target identity
      const normTargetTitle = normalizeText(title);
      const normResolvedTitle = normalizeText(data.trackName || '');
      const titleMatch = normResolvedTitle.includes(normTargetTitle) || normTargetTitle.includes(normResolvedTitle);

      const normTargetArtist = normalizeText(artist);
      const normResolvedArtist = normalizeText(data.artistName || '');
      const artistMatch = normResolvedArtist.includes(normTargetArtist) || normTargetArtist.includes(normResolvedArtist);

      if (titleMatch && artistMatch) {
        let lines = [];
        if (data.syncedLyrics) {
          lines = data.syncedLyrics
            .split('\n')
            .filter(Boolean)
            .map(l => {
              const m = l.match(/\[(\d+):(\d+\.\d+)\](.*)/);
              if (!m) return null;
              const startMs = (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000;
              return { text: m[3].trim(), startMs: Math.round(startMs) };
            })
            .filter(Boolean);
        }

        const result = {
          valid: true,
          synced: lines.length > 0,
          lines,
          trackName: data.trackName,
          artistName: data.artistName,
          albumName: data.albumName,
          durationMs: data.duration ? data.duration * 1000 : durationMs,
          source: 'lrclib_exact_get',
        };
        setCache(cacheKey, result, 604800);
        return result;
      }
    }
  } catch {}
  return null;
}

// 2. Structured Entity Page Discovery (Letras.mus.br direct YouTube ID binding)
async function fetchLetrasEntity(artists, title) {
  const artistList = Array.isArray(artists) ? artists : [{ name: artists }];
  const primaryArtist = artistList[0]?.name || '';
  const cacheKey = `letras:${primaryArtist}:${title}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const candidateArtists = artistList.map(a => a.name).filter(Boolean);
  const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/feat\..*$/i, '').trim();

  for (const art of candidateArtists) {
    const slugA = slugify(art);
    const urls = [
      `https://www.letras.mus.br/${slugA}/${slugify(cleanTitle)}/`,
      `https://www.letras.mus.br/${slugA}/${slugify(title)}/`,
    ];

    for (const pageUrl of urls) {
      try {
        const res = await fetch(pageUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const html = await res.text();
          const ytMatch =
            html.match(/"YoutubeID":"([a-zA-Z0-9_-]{11})"/i) ||
            html.match(/"video":"([a-zA-Z0-9_-]{11})"/i);

          if (ytMatch?.[1]) {
            const result = {
              provider: 'letras',
              pageUrl,
              youtubeId: ytMatch[1],
              youtubeUrl: `https://www.youtube.com/watch?v=${ytMatch[1]}`,
            };
            setCache(cacheKey, result, 604800);
            return result;
          }
        }
      } catch {}
    }
  }
  return null;
}

// 3. Metadata Provider: Deezer Search (Used ONLY for enriching missing ISRC/duration, NEVER overwriting locked identity)
async function fetchDeezerEnrichment(compositeQueries) {
  for (const query of compositeQueries) {
    const cacheKey = `deezer:${query}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`);
      if (res.ok) {
        const data = await res.json();
        const item = data.data?.[0];
        if (item) {
          const result = {
            durationMs: (item.duration || 0) * 1000,
            isrc: item.isrc || '',
            artworkUrl: item.album?.cover_big || item.album?.cover_medium || '',
          };
          setCache(cacheKey, result, 86400);
          return result;
        }
      }
    } catch {}
  }
  return null;
}

// 4. Audio Provider: SoundCloud Stream with Strict Boolean Match Guard
async function fetchSoundCloudCandidate(lockedTarget) {
  const clientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';
  const queries = [
    `${lockedTarget.artists[0]?.name || ''} - ${lockedTarget.title}`,
    lockedTarget.title,
  ];

  for (const query of queries) {
    const cacheKey = `sc:${query}:${lockedTarget.durationMs}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=12`);
      if (!res.ok) continue;
      const data = await res.json();

      for (const item of data.collection || []) {
        const guard = evaluateBooleanGuard(lockedTarget, {
          title: item.title,
          author: item.user?.username,
          artist: item.user?.username,
          durationMs: item.duration,
        });

        if (guard.passed) {
          const transcodings = (item.media?.transcodings || []).filter(t => !t.format?.protocol?.includes('encrypted'));
          const progressive = transcodings.find(t => t.format?.protocol === 'progressive') || transcodings[0];
          if (progressive?.url) {
            const sRes = await fetch(`${progressive.url}?client_id=${clientId}`);
            if (sRes.ok) {
              const sData = await sRes.json();
              if (sData.url) {
                const result = {
                  url: sData.url,
                  format: 'mp3',
                  quality: '128kbps',
                  confidence: guard.confidence,
                  verified: true,
                  score: guard.score,
                  sourceTitle: item.title,
                  sourceArtist: item.user?.username,
                };
                setCache(cacheKey, result, 300);
                return result;
              }
            }
          }
        }
      }
    } catch {}
  }
  return null;
}

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
    res.end(JSON.stringify({ status: 'ok', service: 'openfy-exact-get-resolution-engine', time: new Date().toISOString() }));
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

  // POST /api/music/resolve (Deterministic Exact-GET + Identity Locked Pipeline)
  if (pathname === '/api/music/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { title, artist, artists, albumName, durationMs, spotifyId, isrc, imageURL } = payload;

        if (!title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Title is required' }));
          return;
        }

        // STEP 1: IDENTITY LOCK 🔒
        // Canonical Target is permanently sealed.
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

        console.log(`[Exact GET Identifier] Target: "${lockedTarget.artistName} - ${lockedTarget.title}" (${lockedTarget.durationMs}ms)`);

        // STEP 2: EXACT GET IDENTIFIER (First attempt: direct parametric match)
        const exactGet = await fetchExactIdentifierGet(
          lockedTarget.title,
          lockedTarget.artistName,
          lockedTarget.durationMs,
          lockedTarget.albumName
        );

        let resolvedLyrics = exactGet?.valid ? { synced: exactGet.synced, lines: exactGet.lines } : null;

        // STEP 3: Enrich missing ISRC / duration if needed
        if (!lockedTarget.durationMs || !lockedTarget.isrc) {
          const compositeQueries = [
            `"${lockedTarget.title}" "${lockedTarget.artistName}"`,
            `${lockedTarget.artistName} ${lockedTarget.title}`,
            lockedTarget.title,
          ];
          const enrichment = await fetchDeezerEnrichment(compositeQueries);
          if (enrichment) {
            if (!lockedTarget.durationMs && enrichment.durationMs) {
              lockedTarget.durationMs = enrichment.durationMs;
            }
            if (!lockedTarget.isrc && enrichment.isrc) {
              lockedTarget.isrc = enrichment.isrc;
            }
            if (!lockedTarget.imageURL && enrichment.artworkUrl) {
              lockedTarget.imageURL = enrichment.artworkUrl;
            }
          }
        }

        // STEP 4: DISCOVERY - Letras Entity Relations (Lyrics fallback + Direct YouTube Link)
        const letrasEntity = await fetchLetrasEntity(lockedTarget.artists, lockedTarget.title);

        // STEP 5: RESOLUTION - SoundCloud stream verified with BooleanMatchGuard
        const audioSource = await fetchSoundCloudCandidate(lockedTarget);

        // Build Decoupled Response (identity, metadata, artwork, lyrics, playback)
        const responseData = {
          confidence: audioSource ? audioSource.confidence : letrasEntity ? 'VERY_HIGH' : 'UNCERTAIN',
          status: (audioSource || letrasEntity) ? 'EXACT' : 'NO_MATCH',
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
          playback: audioSource ? {
            type: 'DIRECT_AUDIO',
            url: `http://localhost:${PORT}/api/audio/proxy?url=${encodeURIComponent(audioSource.url)}`,
            directUrl: audioSource.url,
            provider: 'soundcloud',
            format: audioSource.format,
            quality: audioSource.quality,
            verified: true,
            confidence: audioSource.confidence,
            score: audioSource.score,
          } : (letrasEntity ? {
            type: 'EXTERNAL',
            provider: 'youtube',
            url: letrasEntity.youtubeUrl,
            directUrl: letrasEntity.youtubeUrl,
            format: 'stream',
            quality: 'official_video',
            verified: true,
            confidence: 'VERY_HIGH',
            score: 0.95,
          } : undefined),
          // Backward-compatible track format
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
          source: audioSource ? {
            type: 'DIRECT_AUDIO',
            url: `http://localhost:${PORT}/api/audio/proxy?url=${encodeURIComponent(audioSource.url)}`,
            directUrl: audioSource.url,
            format: audioSource.format,
            quality: audioSource.quality,
            verified: true,
            score: audioSource.score,
          } : (letrasEntity ? {
            type: 'EXTERNAL',
            provider: 'youtube',
            id: letrasEntity.youtubeId,
            url: letrasEntity.youtubeUrl,
            verified: true,
            score: 0.95,
          } : null),
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
  console.log(`🚀 [Openfy Exact GET Resolution Server] Running on http://localhost:${PORT}`);
});
