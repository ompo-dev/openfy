const DEFAULT_TIMEOUT_MS = 20_000;

const withTimeout = async (request, label, timeoutMs) => {
  let timeout;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const formatFromMimeType = (mimeType) =>
  typeof mimeType === 'string' && mimeType.includes('audio/webm') ? 'webm' : 'm4a';

const createInnertubeTrackResolver = ({
  loadInnertube = () => import('youtubei.js'),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
  let clientPromise = null;

  const getClient = () => {
    if (!clientPromise) {
      clientPromise = Promise.resolve()
        .then(loadInnertube)
        .then(({ Innertube }) =>
          Innertube.create({
            generate_session_locally: true,
            retrieve_innertube_config: false,
            retrieve_player: false,
          })
        )
        .catch((error) => {
          clientPromise = null;
          throw error;
        });
    }
    return clientPromise;
  };

  return async (videoId) => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

    try {
      const client = await withTimeout(
        getClient(),
        'YouTube InnerTube initialization',
        timeoutMs
      );
      const [info, stream] = await Promise.all([
        withTimeout(client.getBasicInfo(videoId), 'YouTube video metadata', timeoutMs),
        withTimeout(
          client.getStreamingData(videoId, {
            client: 'IOS',
            quality: 'best',
            type: 'audio',
          }),
          'YouTube audio resolution',
          timeoutMs
        ),
      ]);
      const title = info?.basic_info?.title?.trim();
      const streamUrl = stream?.url;
      if (!title || !/^https:\/\//i.test(streamUrl || '')) return null;

      const thumbnail = info.basic_info.thumbnail;
      return {
        videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        streamUrl,
        title,
        artistName: info.basic_info.author?.trim() || 'YouTube',
        albumName: info.basic_info.author?.trim() || 'YouTube',
        imageURL: Array.isArray(thumbnail) ? thumbnail.at(-1)?.url || '' : '',
        duration_ms: Math.max(0, Number(info.basic_info.duration || 0)) * 1000,
        viewCount: 0,
        format: formatFromMimeType(stream.mime_type),
      };
    } catch (error) {
      console.warn(
        `[YouTube InnerTube] failed for ${videoId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  };
};

module.exports = { createInnertubeTrackResolver };
