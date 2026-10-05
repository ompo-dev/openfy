import type { YouTubeMusicClient } from './youtubeMusicClient';

export const createYouTubeMusicClient = (options: object): Promise<YouTubeMusicClient> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Innertube } = require('youtubei.js');
  return Innertube.create(options);
};
