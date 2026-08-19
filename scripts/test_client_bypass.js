const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

async function testClients() {
  const clients = [
    'android_creator,web_creator',
    'tv',
    'tv_embedded',
    'mweb',
    'web'
  ];

  for (const client of clients) {
    console.log(`\nTesting client: ${client}...`);
    const outputPath = path.resolve(__dirname, `../.e2e_output/test_${client.replace(/,/g, '_')}.mp3`);

    try {
      await youtubedl('https://www.youtube.com/watch?v=PAMdKQu7aPg', {
        extractAudio: true,
        audioFormat: 'mp3',
        output: outputPath,
        noCheckCertificates: true,
        extractorArgs: `youtube:player_client=${client}`,
      });

      const stat = fs.statSync(outputPath);
      console.log(`🎉 SUCCESS with ${client}! File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
      return client;
    } catch (e) {
      console.log(`  -> Failed with ${client}:`, (e.stderr || e.message).slice(0, 150));
    }
  }
}

testClients();
