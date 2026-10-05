import type { YouTubeMusicClient } from './youtubeMusicClient';

export const createYouTubeMusicClient = (options: object): Promise<YouTubeMusicClient> => {
  // The vendor's web bundle avoids its ESM initialization cycle under Metro.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Innertube } = require('youtubei.js/web.bundle');
  return Innertube.create(options);
};
