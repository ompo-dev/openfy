// Synthetic tone with a quiet ending, never a downloaded/copyrighted song.
// Usage: node scripts/generate-audio-repair-fixture.cjs /path/to/ffmpeg
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const file = path.join(os.tmpdir(), 'openfy-synthetic-dash.m4a');
execFileSync(process.argv[2] || 'ffmpeg', [
  '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2',
  '-af', 'apad=pad_dur=0.5', '-c:a', 'aac', '-b:a', '64k',
  '-movflags', 'empty_moov+default_base_moof', '-frag_duration', '1000000', file,
]);
const bytes = fs.readFileSync(file);
// Reproduce the nonzero initialization durations in YouTube's DASH files.
// All media is in moof/mdat; the initialization sample tables are empty.
function setDurations(start, end) {
  for (let offset = start; offset < end;) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (size < 8 || offset + size > end) throw new Error('Invalid generated box');
    if (['moov', 'trak', 'mdia'].includes(type)) setDurations(offset + 8, offset + size);
    if (type === 'mvhd' || type === 'mdhd') {
      const scale = bytes.readUInt32BE(offset + 20);
      bytes.writeUInt32BE(Math.round(scale * 2.5), offset + 24);
    }
    if (type === 'tkhd') bytes.writeUInt32BE(2500, offset + 28);
    offset += size;
  }
}
setDurations(0, bytes.length);
const directory = path.join(__dirname, 'fixtures');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'synthetic-dash.m4a'), bytes);
fs.unlinkSync(file);
console.log(`Generated synthetic DASH regression fixture: ${bytes.length} bytes`);
