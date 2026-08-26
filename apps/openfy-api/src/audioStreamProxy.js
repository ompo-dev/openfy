const MAX_AUDIO_REDIRECTS = 4;
const AUDIO_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

const fetchAllowedAudioStream = async (initialUrl, range, fetchImpl = fetch) => {
  let targetUrl = isAllowedAudioStreamUrl(initialUrl);
  if (!targetUrl) throw new Error('Unsupported audio stream URL');

  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(30000)
      : undefined;

  for (let redirects = 0; redirects <= MAX_AUDIO_REDIRECTS; redirects += 1) {
    const audioRes = await fetchImpl(targetUrl, {
      headers: range ? { Range: range } : undefined,
      redirect: 'manual',
      signal,
    });

    if (AUDIO_REDIRECT_STATUSES.has(audioRes.status)) {
      if (redirects === MAX_AUDIO_REDIRECTS) {
        throw new Error('Too many audio stream redirects');
      }

      const location = audioRes.headers.get('location');
      const nextUrl = location ? isAllowedAudioStreamUrl(new URL(location, targetUrl)) : null;
      if (!nextUrl) throw new Error('Unsupported audio stream redirect');

      targetUrl = nextUrl;
      continue;
    }

    if (!audioRes.ok && audioRes.status !== 206) {
      throw new Error(`Upstream audio response ${audioRes.status}`);
    }
    if (!audioRes.body) throw new Error('Empty upstream audio response');

    return audioRes;
  }

  throw new Error('Too many audio stream redirects');
};

module.exports = {
  fetchAllowedAudioStream,
  isAllowedAudioStreamUrl,
};
