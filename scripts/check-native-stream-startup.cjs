// Mirrors the native guest request and validates only the first 16 KB, never a full song.
const { randomUUID } = require('node:crypto');
const videoId = process.argv[2] || 'Sr_xajpZsPk';
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const headers = { 'User-Agent': ua, Origin: 'https://www.youtube.com', Referer: 'https://www.youtube.com/' };

async function player(visitor) {
  const started = performance.now();
  const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', signal: AbortSignal.timeout(8000), headers: { ...headers,
      'Content-Type': 'application/json', 'X-YouTube-Client-Name': '101', 'X-YouTube-Client-Version': '1.02',
      ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {}) },
    body: JSON.stringify({ context: { client: { clientName: 'VISIONOS', clientVersion: '1.02', userAgent: ua,
      utcOffsetMinutes: 0, osName: 'visionOS', osVersion: '26.5.23O471', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1',
      hl: 'en', gl: 'US', ...(visitor ? { visitorData: visitor } : {}) }, user: { enableSafetyMode: false, lockedSafetyMode: false },
      request: { useSsl: true, internalExperimentFlags: [] } }, videoId, contentCheckOk: true, racyCheckOk: true,
      cpn: randomUUID().replaceAll('-', '').slice(0, 16),
      playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } } }),
  });
  const payload = await response.json();
  console.log(JSON.stringify({ stage: 'player', durationMs: Math.round(performance.now() - started),
    httpStatus: response.status, playability: payload.playabilityStatus?.status }));
  return payload;
}

async function main() {
  let payload = await player();
  const visitor = payload.responseContext?.visitorData;
  if (payload.playabilityStatus?.status === 'LOGIN_REQUIRED' && visitor) payload = await player(visitor);
  if (payload.playabilityStatus?.status !== 'OK') throw new Error(`Player refused: ${payload.playabilityStatus?.status}`);
  const format = (payload.streamingData?.adaptiveFormats || []).filter((item) =>
    item.url && item.mimeType?.startsWith('audio/mp4')).sort((a, b) => b.bitrate - a.bitrate)[0];
  if (!format) throw new Error('No direct AAC stream');
  const started = performance.now();
  const response = await fetch(format.url, { headers: { ...headers, Range: 'bytes=0-16383' }, signal: AbortSignal.timeout(8000) });
  if (response.status !== 206) { await response.body?.cancel(); throw new Error(`Range refused: ${response.status}`); }
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.length > 16384) throw new Error('Range exceeded requested bytes');
  console.log(JSON.stringify({ stage: 'first-range', durationMs: Math.round(performance.now() - started),
    httpStatus: response.status, bytes: data.length, contentRange: response.headers.get('content-range'),
    mediaDurationSeconds: payload.videoDetails?.lengthSeconds }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
