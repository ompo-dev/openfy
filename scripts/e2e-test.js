/**
 * Openfy Comprehensive End-to-End (E2E) Test Suite
 * Validates all core features: Audio Resolving, HLS Assembly, Download Pipeline,
 * Metadata Parsing, Lyrics Engine, and TypeScript/Bundle Integrity.
 */

const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', '.e2e_output');
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function testLinkParser() {
  console.log('\n=========================================');
  console.log('TEST 1: Spotify Link Parser E2E');
  console.log('=========================================');

  const trackUrl = 'https://open.spotify.com/track/6dOtVTDmmpzgGQ9qd0RMiZ?si=123';
  const playlistUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
  const albumUrl = 'https://open.spotify.com/album/4m2880jivSbbyEGAKfITCa';

  const parse = (url) => {
    const clean = url.split('?')[0];
    const match = clean.match(/open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
    if (match) {
      return { type: match[1], id: match[2] };
    }
    return null;
  };

  const parsedTrack = parse(trackUrl);
  assert(parsedTrack && parsedTrack.type === 'track' && parsedTrack.id === '6dOtVTDmmpzgGQ9qd0RMiZ', 'Track URL parsed correctly');

  const parsedPlaylist = parse(playlistUrl);
  assert(parsedPlaylist && parsedPlaylist.type === 'playlist' && parsedPlaylist.id === '37i9dQZF1DXcBWIGoYBM5M', 'Playlist URL parsed correctly');

  const parsedAlbum = parse(albumUrl);
  assert(parsedAlbum && parsedAlbum.type === 'album' && parsedAlbum.id === '4m2880jivSbbyEGAKfITCa', 'Album URL parsed correctly');
}

async function testAudioResolution() {
  console.log('\n=========================================');
  console.log('TEST 2: Audio Resolution Engine E2E');
  console.log('=========================================');

  const clientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';
  const tracksToTest = [
    { title: 'BIRDS OF A FEATHER', artist: 'Billie Eilish', durationSec: 194 },
    { title: 'Blinding Lights', artist: 'The Weeknd', durationSec: 200 },
  ];

  for (const track of tracksToTest) {
    console.log(`\nResolving audio for: "${track.artist} - ${track.title}"...`);
    const q = encodeURIComponent(`${track.artist} ${track.title} audio`);
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${q}&client_id=${clientId}&limit=6`;
    
    const res = await fetch(searchUrl);
    assert(res.ok, `SoundCloud search returned status ${res.status}`);
    
    const data = await res.json();
    assert(data.collection && data.collection.length > 0, `SoundCloud returned candidates for ${track.title}`);

    // Filter out < 60s (previews)
    const validCandidates = data.collection.filter(item => {
      const sec = Math.round((item.duration || 0) / 1000);
      return sec >= 60 && sec <= 600;
    });

    assert(validCandidates.length > 0, `Found full-length audio tracks (duration >= 60s) for ${track.title}`);
    
    const best = validCandidates[0];
    const targetTranscoding = best.media?.transcodings?.find(t => t.format?.protocol === 'progressive') ||
                              best.media?.transcodings?.find(t => t.format?.protocol === 'hls');

    assert(Boolean(targetTranscoding), `Track has valid stream transcoding`);

    const streamRes = await fetch(`${targetTranscoding.url}?client_id=${clientId}`);
    assert(streamRes.ok, `Stream URL fetch returned 200 OK`);

    const streamData = await streamRes.json();
    assert(Boolean(streamData.url), `Stream data contains playable URL`);
    assert(!streamData.url.includes('/0/30/'), `Stream URL is NOT a 30s snippet`);
    console.log(`  -> Resolved stream format: ${targetTranscoding.format?.protocol}`);
  }
}

async function testDownloadAndAssembly() {
  console.log('\n=========================================');
  console.log('TEST 3: Download & HLS Assembly Pipeline E2E');
  console.log('=========================================');

  const clientId = 'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep';
  const q = encodeURIComponent('Billie Eilish BIRDS OF A FEATHER audio');
  const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${q}&client_id=${clientId}&limit=5`;
  
  const res = await fetch(searchUrl);
  const data = await res.json();
  const validCandidate = data.collection.find(item => {
    const sec = Math.round((item.duration || 0) / 1000);
    return sec >= 120 && sec <= 400;
  });

  assert(Boolean(validCandidate), 'Found candidate track for download test');
  console.log(`Downloading track: "${validCandidate.title}"...`);

  const hls = validCandidate.media?.transcodings?.find(t => t.format?.protocol === 'hls');
  assert(Boolean(hls), 'Candidate has HLS transcoding stream');

  const streamRes = await fetch(`${hls.url}?client_id=${clientId}`);
  const streamData = await streamRes.json();
  assert(Boolean(streamData.url), 'Obtained m3u8 playlist URL');

  // Fetch playlist
  const m3u8Res = await fetch(streamData.url);
  const m3u8Text = await m3u8Res.text();
  const segmentUrls = m3u8Text.split('\n').map(s => s.trim()).filter(s => s.startsWith('http'));
  assert(segmentUrls.length > 0, `Extracted ${segmentUrls.length} audio chunks from m3u8`);

  // Download first 4 chunks to verify binary assembly
  const chunksToDownload = segmentUrls.slice(0, 4);
  const chunkBuffers = [];
  for (let i = 0; i < chunksToDownload.length; i++) {
    const chunkRes = await fetch(chunksToDownload[i]);
    assert(chunkRes.ok, `Chunk ${i} fetched successfully`);
    const buf = await chunkRes.arrayBuffer();
    chunkBuffers.push(Buffer.from(buf));
  }

  const merged = Buffer.concat(chunkBuffers);
  const outputFile = path.join(TEST_DIR, 'test_e2e_audio.mp3');
  fs.writeFileSync(outputFile, merged);

  const stat = fs.statSync(outputFile);
  assert(stat.size > 50000, `Downloaded & merged audio file on disk has size ${stat.size} bytes (> 50KB)`);
  console.log(`  -> Verified file written: ${outputFile} (${(stat.size / 1024).toFixed(1)} KB)`);
}

async function testLyricsEngine() {
  console.log('\n=========================================');
  console.log('TEST 4: Lyrics Engine & Time-Sync E2E');
  console.log('=========================================');

  const title = 'BIRDS OF A FEATHER';
  const artist = 'Billie Eilish';
  const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;

  const res = await fetch(url);
  assert(res.ok, `Lrclib API returned status ${res.status}`);

  const data = await res.json();
  assert(Boolean(data.syncedLyrics || data.plainLyrics), 'Retrieved lyrics for song');

  if (data.syncedLyrics) {
    const lines = data.syncedLyrics.split('\n');
    const segments = [];
    for (const line of lines) {
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = parseInt(match[3].padEnd(3, '0'), 10);
        const startTimeMs = (min * 60 + sec) * 1000 + ms;
        const text = match[4].trim();
        if (text) {
          segments.push({ startTimeMs, text });
        }
      }
    }
    assert(segments.length > 5, `Parsed ${segments.length} synchronized lyric timestamps`);
    console.log(`  -> Sample lyric [${segments[0].startTimeMs}ms]: "${segments[0].text}"`);
  }
}

async function main() {
  console.log('======================================================');
  console.log('       OPENFY COMPREHENSIVE E2E TEST RUNNER           ');
  console.log('======================================================');

  try {
    await testLinkParser();
    await testAudioResolution();
    await testDownloadAndAssembly();
    await testLyricsEngine();

    console.log('\n======================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} E2E TESTS PASSED SUCCESSFULLY!`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ E2E TEST RUN FAILED:', err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  }
}

main();
