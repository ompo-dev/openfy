/** Stable progressive audio only; never retain signed transport URLs as mix sources. */
export const stableDirectAudioUrl = (value?: string): { url: string; format: string } | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      /(^|\.)(youtube\.com|youtu\.be|googlevideo\.com)$/i.test(url.hostname)) return null;
    for (const key of url.searchParams.keys()) {
      if (/^(?:sig|signature|expire|expires|expiry|token|auth|authorization|key|policy|session|hdnts|x-amz-.*)$/i.test(key)) return null;
    }
    const extension = url.pathname.match(/\.(mp3|m4a|mp4|aac|wav|flac|ogg|webm)$/i)?.[1]?.toLowerCase();
    if (!extension) return null;
    return { url: url.toString(), format: extension === 'mp4' ? 'm4a' : extension };
  } catch { return null; }
};
