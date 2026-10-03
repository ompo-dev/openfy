import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME_TYPES = {
  css: 'text/css',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  png: 'image/png',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  webp: 'image/webp',
  xml: 'application/xml',
};

const normalizeExportPath = (value) => {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => part === '..')
  ) {
    throw new Error(`Invalid export asset path: ${value}`);
  }
  return normalized;
};

const sha256Base64Url = (buffer) =>
  createHash('sha256').update(buffer).digest('base64url');

const updateUUID = (metadataBuffer) => {
  const hex = createHash('sha256').update(metadataBuffer).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const assetContentType = (extension) => {
  const contentType = MIME_TYPES[extension.toLowerCase()];
  if (!contentType) throw new Error(`Unsupported exported asset type: ${extension}`);
  return contentType;
};

const getPublicBaseUrl = (request) => {
  const host = request.headers['x-forwarded-host'] || request.headers.host || '';
  if (typeof host !== 'string' || !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(host)) {
    throw new Error('Request host is not a Cloudflare Quick Tunnel hostname.');
  }
  return `https://${host}`;
};

export async function createExpoUpdateServer({
  directory,
  runtimeVersion,
  expoConfig,
  createdAt = new Date().toISOString(),
}) {
  const exportDirectory = path.resolve(directory);
  const metadataBuffer = await readFile(path.join(exportDirectory, 'metadata.json'));
  const metadata = JSON.parse(metadataBuffer.toString('utf8'));
  const clientConfig = {
    ...expoConfig,
    runtimeVersion:
      typeof expoConfig.runtimeVersion === 'string'
        ? expoConfig.runtimeVersion
        : expoConfig.version,
  };
  const updateId = updateUUID(metadataBuffer);
  const assetsByPlatform = new Map();
  const manifestsByPlatform = new Map();

  for (const platform of ['ios', 'android']) {
    const files = metadata.fileMetadata?.[platform];
    if (!files?.bundle || !Array.isArray(files.assets)) {
      throw new Error(`Expo export is missing ${platform} file metadata.`);
    }

    const platformAssets = new Map();
    const buildAsset = async (exportPath, extension, isLaunchAsset) => {
      const relativePath = normalizeExportPath(exportPath);
      const absolutePath = path.resolve(exportDirectory, relativePath);
      if (!absolutePath.startsWith(`${exportDirectory}${path.sep}`)) {
        throw new Error(`Export asset escaped output directory: ${relativePath}`);
      }
      const body = await readFile(absolutePath);
      const contentType = isLaunchAsset
        ? 'application/javascript'
        : assetContentType(extension);
      const asset = {
        hash: sha256Base64Url(body),
        key: createHash('md5').update(body).digest('hex'),
        fileExtension: `.${isLaunchAsset ? 'bundle' : extension}`,
        contentType,
        url: null,
      };
      platformAssets.set(relativePath, { body, contentType });
      return { relativePath, asset };
    };

    const launch = await buildAsset(files.bundle, null, true);
    const assets = await Promise.all(
      files.assets.map(async ({ path: assetPath, ext }) => buildAsset(assetPath, ext, false))
    );
    assetsByPlatform.set(platform, platformAssets);
    manifestsByPlatform.set(platform, { launch, assets });
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');

    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, runtimeVersion, updateId, createdAt }));
      return;
    }

    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' });
      response.end();
      return;
    }

    if (url.pathname === '/api/manifest') {
      const platform = request.headers['expo-platform'];
      const requestedRuntime = request.headers['expo-runtime-version'];
      if (request.headers['expo-protocol-version'] !== '1') {
        response.writeHead(406, { 'cache-control': 'no-store' });
        response.end('Expo Updates protocol version 1 is required.');
        return;
      }
      if (!['ios', 'android'].includes(platform)) {
        response.writeHead(400, { 'cache-control': 'no-store' });
        response.end('Unsupported Expo platform.');
        return;
      }
      if (requestedRuntime !== runtimeVersion) {
        response.writeHead(404, { 'cache-control': 'no-store' });
        response.end('No update matches this runtime version.');
        return;
      }

      try {
        const baseUrl = getPublicBaseUrl(request);
        const platformFiles = manifestsByPlatform.get(platform);
        const makeManifestAsset = ({ relativePath, asset }) => ({
          ...asset,
          url: `${baseUrl}/api/assets?platform=${platform}&asset=${encodeURIComponent(relativePath)}`,
        });
        const manifest = {
          id: updateId,
          createdAt,
          runtimeVersion,
          launchAsset: makeManifestAsset(platformFiles.launch),
          assets: platformFiles.assets.map(makeManifestAsset),
          metadata: {},
          extra: { expoClient: clientConfig },
        };

        response.writeHead(200, {
          'cache-control': 'private, max-age=0',
          'content-type': request.headers.accept?.includes('application/expo+json')
            ? 'application/expo+json'
            : 'application/json',
          'expo-manifest-filters': '',
          'expo-protocol-version': '1',
          'expo-server-defined-headers': '',
          'expo-sfv-version': '0',
        });
        response.end(JSON.stringify(manifest));
      } catch (error) {
        response.writeHead(400, { 'cache-control': 'no-store' });
        response.end(error instanceof Error ? error.message : 'Invalid manifest request.');
      }
      return;
    }

    if (url.pathname === '/api/assets') {
      const platform = url.searchParams.get('platform');
      const assetPath = url.searchParams.get('asset');
      const platformAssets = assetsByPlatform.get(platform);
      if (!platformAssets || !assetPath) {
        response.writeHead(400, { 'cache-control': 'no-store' });
        response.end('Invalid asset request.');
        return;
      }

      let normalizedAssetPath;
      try {
        normalizedAssetPath = normalizeExportPath(assetPath);
      } catch {
        response.writeHead(400, { 'cache-control': 'no-store' });
        response.end('Invalid asset path.');
        return;
      }

      const asset = platformAssets.get(normalizedAssetPath);
      if (!asset) {
        response.writeHead(404, { 'cache-control': 'no-store' });
        response.end('Asset was not included in this platform update.');
        return;
      }
      response.writeHead(200, {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-length': asset.body.length,
        'content-type': asset.contentType,
      });
      response.end(asset.body);
      return;
    }

    response.writeHead(404, { 'cache-control': 'no-store' });
    response.end('Not found.');
  });

  return server;
}

const parseArgs = (args) => {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const [key, inlineValue] = args[index].split('=', 2);
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = inlineValue ?? args[++index];
    if (!value) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
  }
  return values;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directory = args.get('directory');
  const runtimeVersion = args.get('runtime-version');
  const configPath = args.get('expo-config');
  const port = Number(args.get('port') || 8787);
  if (!directory || !runtimeVersion || !configPath || !Number.isInteger(port)) {
    throw new Error(
      'Usage: node scripts/temporary-expo-update-server.mjs --directory <dir> --runtime-version <version> --expo-config <file> [--port 8787]'
    );
  }

  const expoConfig = JSON.parse(await readFile(path.resolve(configPath), 'utf8'));
  const server = await createExpoUpdateServer({ directory, runtimeVersion, expoConfig });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Temporary Expo Updates server listening on 127.0.0.1:${port}\n`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
