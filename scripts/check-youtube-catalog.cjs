// Live provider smoke test. Uses the app's real matching code with memory-only
// storage, without launching RN, resolving a stream, or downloading any audio.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modules = new Map();
const storage = new Map();
const diagnostics = [];

async function main() {
  const youtube = await import('youtubei.js');
  const load = (filename) => {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const localRequire = (name) => {
      if (name === 'youtubei.js') return youtube;
      if (name === '@react-native-async-storage/async-storage') return {
        getItem: async (key) => storage.get(key) || null,
        setItem: async (key, value) => { storage.set(key, value); },
      };
      if (name.endsWith('/downloadDiagnostics')) return {
        recordDownloadDiagnostic: (_id, phase, details) => diagnostics.push({ phase, ...details }),
      };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports);
    return module.exports;
  };
  const { fetchSpotifyTrackMetadata } = load(path.join(root, 'services/metadata/spotifyMetadata.ts'));
  const { resolveSpotifyTrackVideoId } = load(path.join(root, 'services/audio/catalogResolver.ts'));
  const spotifyId = process.argv[2] || '7LQas0ePVqtRXHzopsCY5a';
  const track = await fetchSpotifyTrackMetadata(spotifyId);
  if (!track?.artists.length || !track.duration_ms) throw new Error('Spotify metadata unavailable');
  const result = await resolveSpotifyTrackVideoId(spotifyId, track.title, track.artists.map((a) => a.name), track.duration_ms);
  console.log(JSON.stringify({ track, result, selected: diagnostics.find((d) => d.phase === 'audio.youtube.selected'),
    candidates: diagnostics.filter((d) => d.phase.includes('candidate.')) }, null, 2));
  if (result.status !== 'resolved') process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
