/** App-local signal to defer best-effort requests during interactive audio startup. */
let playbackPriorityUntil = 0;

export const reservePlaybackStartup = (windowMs = 7_000) => {
  playbackPriorityUntil = Math.max(playbackPriorityUntil, Date.now() + windowMs);
};

export const playbackStartupPending = () => Date.now() < playbackPriorityUntil;

/** Background work waits at most once, with a hard cap, never blocking a play command. */
export const yieldToPlaybackStartup = async (maxDelayMs = 5_000) => {
  const remaining = Math.min(maxDelayMs, Math.max(0, playbackPriorityUntil - Date.now()));
  if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
};

export const _resetPlaybackPriorityForTests = () => { playbackPriorityUntil = 0; };
