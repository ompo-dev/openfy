const path = require('path');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

async function testYtdlCore(videoId) {
  console.log(`Extracting audio stream using @distube/ytdl-core for video ${videoId} (Poetas no Topo 4)...`);
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const info = await ytdl.getInfo(ytUrl);
    console.log('Video Title:', info.videoDetails.title);
    console.log('Channel:', info.videoDetails.author.name);
    console.log('Duration (s):', info.videoDetails.lengthSeconds);

    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    console.log(`Found ${audioFormats.length} audio formats!`);
    
    if (audioFormats.length > 0) {
      const topAudio = audioFormats[0];
      console.log('Top Audio Format:', {
        itag: topAudio.itag,
        container: topAudio.container,
        audioQuality: topAudio.audioQuality,
        bitrate: topAudio.audioBitrate,
      });

      // Stream a small test chunk
      const stream = ytdl(ytUrl, { quality: 'highestaudio', filter: 'audioonly' });
      const outputPath = path.resolve(__dirname, '../.e2e_output/test_poetas4_chunk.mp3');
      const fileStream = fs.createWriteStream(outputPath);

      let bytesReceived = 0;
      stream.on('data', (chunk) => {
        bytesReceived += chunk.length;
        if (bytesReceived > 200000) {
          stream.destroy();
          fileStream.close();
          console.log(`✅ Successfully downloaded and wrote ${bytesReceived} bytes of MP3 audio!`);
        }
      });

      stream.pipe(fileStream);

      stream.on('error', (err) => {
        console.log('Stream error:', err.message);
      });
    }
  } catch (e) {
    console.error('ytdl error:', e.message);
  }
}

testYtdlCore('PAMdKQu7aPg');
