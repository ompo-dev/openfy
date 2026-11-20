import { createYouTubeMusicClient } from './youtubeMusicRuntime';
import type { YouTubeMusicClient } from './youtubeMusicClient';
import { createAsyncResourceCache } from '../src/application/asyncResourceCache';
import { log } from '../utils/appLogger';

type BasicInfo = { basic_info: { title?: string; author?: string; duration?: number; thumbnail?: { url: string }[] } };
type DiscoveryClient = YouTubeMusicClient & {
  search: (query: string, options: { type: 'video' }) => Promise<{ videos?: unknown[] }>;
  getBasicInfo: (videoId: string) => Promise<BasicInfo>;
};
let session: Promise<DiscoveryClient> | null = null;
const metadata = createAsyncResourceCache<BasicInfo>({ name: 'youtube shared video metadata',
  category: 'player', maxEntries: 128, shouldCache: (info) => Boolean(info.basic_info.title?.trim()) });

/** Browse/search share one light session; stream authorization retains its own client. */
export const getYouTubeDiscoveryClient = (): Promise<DiscoveryClient> => {
  if (!session) {
    const finish = log.time('network', 'youtube discovery session initialize');
    session = createYouTubeMusicClient({ lang: 'pt', location: 'BR', generate_session_locally: false,
      retrieve_innertube_config: true, retrieve_player: false }).then((client) => {
      finish({ ok: true }); return client as DiscoveryClient;
    }).catch((error) => { session = null; finish({ ok: false, error: String(error) }); throw error; });
  }
  return session;
};

export const getYouTubeVideoMetadata = (videoId: string) => metadata.getOrLoad(videoId, async () => {
  const client = await getYouTubeDiscoveryClient();
  const info = await client.getBasicInfo(videoId);
  return { basic_info: { title: info.basic_info.title, author: info.basic_info.author,
    duration: info.basic_info.duration, thumbnail: info.basic_info.thumbnail } };
}, 60 * 60_000);

export const resetYouTubeDiscoveryForTests = () => { session = null; metadata.clear(); };
