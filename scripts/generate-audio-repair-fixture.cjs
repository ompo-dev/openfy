// Synthetic tone with a quiet ending, never a downloaded/copyrighted song.
/* global __dirname */
// Usage: node scripts/generate-audio-repair-fixture.cjs /path/to/ffmpeg
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const file = path.join(os.tmpdir(), 'openfy-synthetic-dash.m4a');
execFileSync(process.argv[2] || 'ffmpeg', [
  '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2',
  '-af', 'apad=pad_dur=0.5', '-c:a', 'aac', '-b:a', '64k',
  '-movflags', 'empty_moov+default_base_moof+skip_trailer', '-frag_duration', '1000000', file,
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

function findBox(start, end, type) {
  for (let offset = start; offset < end; offset += bytes.readUInt32BE(offset)) {
    if (bytes.toString('ascii', offset + 4, offset + 8) === type) return offset;
  }
  throw new Error(`Missing ${type}`);
}
const moov = findBox(0, bytes.length, 'moov');
const trak = findBox(moov + 8, moov + bytes.readUInt32BE(moov), 'trak');
const trakEnd = trak + bytes.readUInt32BE(trak);
const edit = Buffer.alloc(36);
edit.writeUInt32BE(36, 0);
edit.write('edts', 4);
edit.writeUInt32BE(28, 8);
edit.write('elst', 12);
edit.writeUInt32BE(1, 20);
edit.writeUInt32BE(2500, 24);
edit.writeUInt32BE(1600, 28);
edit.writeUInt16BE(1, 32);
const edited = Buffer.concat([bytes.subarray(0, trakEnd), edit, bytes.subarray(trakEnd)]);
edited.writeUInt32BE(bytes.readUInt32BE(moov) + edit.length, moov);
edited.writeUInt32BE(bytes.readUInt32BE(trak) + edit.length, trak);
fs.writeFileSync(path.join(directory, 'synthetic-dash-edits.m4a'), edited);
fs.unlinkSync(file);
console.log(`Generated synthetic DASH regression fixture: ${bytes.length} bytes`);
