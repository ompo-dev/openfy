const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

async function testDownloadMp3(videoId) {
  const outputPath = path.resolve(__dirname, '../.e2e_output/poetas4_official.mp3');
  console.log(`Downloading YouTube audio using Node JS runtime for signature solving...`);
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const startTime = Date.now();
    await youtubedl(ytUrl, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '0',
      output: outputPath,
      noCheckCertificates: true,
      jsRuntimes: 'node',
      format: 'bestaudio/best',
    });

    const durationSec = (Date.now() - startTime) / 1000;
    const stat = fs.statSync(outputPath);
    console.log(`🎉 SUCCESS! Downloaded and converted ${stat.size} bytes (${(stat.size / 1024 / 1024).toFixed(2)} MB) of 100% official MP3 audio in ${durationSec.toFixed(1)}s!`);
  } catch (e) {
    console.error('Download error output:', e.stderr || e.message);
  }
}

testDownloadMp3('PAMdKQu7aPg');
