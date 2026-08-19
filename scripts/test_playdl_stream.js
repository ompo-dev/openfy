const play = require('play-dl');
const fs = require('fs');
const path = require('path');

async function testPlayDl(videoId) {
  console.log(`Testing play-dl stream extraction for video ${videoId} (Poetas no Topo 4)...`);
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const stream = await play.stream(ytUrl);
    console.log('Stream type:', stream.type);

    const outputPath = path.resolve(__dirname, '../.e2e_output/test_playdl_poetas.mp3');
    const fileStream = fs.createWriteStream(outputPath);

    let bytes = 0;
    stream.stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 300000) {
        stream.stream.destroy();
        fileStream.close();
        console.log(`🎉 SUCCESS! Downloaded and wrote ${bytes} bytes of YouTube audio to disk!`);
        process.exit(0);
      }
    });

    stream.stream.pipe(fileStream);

    stream.stream.on('error', (err) => {
      console.error('Stream error:', err);
    });
  } catch (e) {
    console.error('play-dl error:', e);
  }
}

testPlayDl('PAMdKQu7aPg');
