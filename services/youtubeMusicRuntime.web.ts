import type { YouTubeMusicClient } from './youtubeMusicClient';

export const createYouTubeMusicClient = (options: object): Promise<YouTubeMusicClient> => {
  // The vendor's web bundle avoids its ESM initialization cycle under Metro.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Innertube } = require('youtubei.js/web.bundle');
  // The client stores fetch on an object; Window.fetch requires its original receiver.
  return Innertube.create({ ...options, fetch: globalThis.fetch.bind(globalThis) });
};
