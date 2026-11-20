import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';

const source = await readFile(new URL('../../.github/workflows/openfy-ci-cd.yml', import.meta.url), 'utf8');
const workflow = YAML.parse(source);
const steps = (job) => workflow.jobs[job].steps;
const commands = (job) => steps(job).map((step) => step.run || '').join('\n');

test('prepares OTA alongside checks without publishing before validation and tests succeed', () => {
  assert.equal(workflow.jobs['preparar-ota'].needs, undefined);
  assert.deepEqual(new Set(workflow.jobs['publicar-ota'].needs), new Set(['validar', 'testar', 'preparar-ota']));
  assert.equal(workflow.jobs['preparar-ota'].permissions.contents, 'read');
  assert.equal(workflow.jobs['publicar-ota'].permissions.contents, 'write');
  assert.doesNotMatch(commands('preparar-ota'), /gh release|cloudflared/);
  assert.equal(workflow.jobs['preparar-ota'].if, workflow.jobs['publicar-ota'].if);
  assert.deepEqual(workflow.jobs['gerar-ipa'].needs, 'validar');
  assert.deepEqual(workflow.jobs['gerar-apk'].needs, 'validar');
  assert.ok(workflow.jobs['validar-audio-local']);
});

test('exports both native platforms without compiling web or repeating npm/export on publication', () => {
  const preparation = commands('preparar-ota');
  assert.match(preparation, /expo export --platform ios --platform android/);
  assert.doesNotMatch(preparation, /--platform (?:all|web)/);
  assert.doesNotMatch(commands('publicar-ota'), /npm ci|expo export|npx expo/);
  assert.match(preparation, /cp .*expo-config\.json.*dist\/ota\/expo-config\.json/);
  assert.match(preparation, /runtime-version\.txt/);
  assert.match(commands('publicar-ota'), /--expo-config dist\/ota\/expo-config\.json/);
});

test('passes the compressed export from this run and reuses only Metro transforms, never a cached bundle', () => {
  const upload = steps('preparar-ota').find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  const download = steps('publicar-ota').find((step) => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(upload.with.name, 'Openfy-OTA-export-${{ github.run_id }}');
  assert.equal(upload.with.name, download.with.name);
  assert.equal(download.with['run-id'], undefined);
  assert.equal(download.with.repository, undefined);
  assert.equal(upload.with['compression-level'], 0);
  assert.equal(upload.with['retention-days'], 1);
  const cache = steps('preparar-ota').find((step) => step.uses?.startsWith('actions/cache@'));
  assert.equal(cache.with.path, '${{ steps.metro-cache.outputs.directory }}');
  assert.match(cache.with.key, /package-lock\.json.*app\.config\.js.*babel\.config.*metro\.config.*patches/);
  assert.match(cache.with.key, /EXPO_PUBLIC_SPOTIFY_CLIENT_ID/);
  assert.match(cache.with.key, /github\.sha/);
  assert.match(commands('preparar-ota'), /tmpdir\(\), 'metro-cache'/);
  assert.match(commands('publicar-ota'), /tar -xzf.*openfy-ota-export\.tar\.gz/);
});

test('preserves the validated temporary endpoint, shutdown and the full ten-minute availability window', () => {
  const publish = commands('publicar-ota');
  assert.match(publish, /--expected-update-id "\$OTA_UPDATE_ID"/);
  assert.match(publish, /--duration-seconds 605/);
  assert.match(publish, /seq 1 600/);
  assert.match(publish, /trap cleanup EXIT/);
  assert.match(publish, /--active false/);
  assert.match(publish, /GITHUB_STEP_SUMMARY/);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
});
