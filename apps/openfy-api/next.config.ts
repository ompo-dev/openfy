import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@distube/ytdl-core', 'youtube-dl-exec', 'youtubei.js'],
  outputFileTracingIncludes: {
    '/*': ['node_modules/youtube-dl-exec/bin/**/*'],
  },
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
