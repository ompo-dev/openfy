const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

async function testCookiesBrowser() {
  const browsers = ['chrome', 'edge', 'firefox', 'brave'];
  const outputPath = path.resolve(__dirname, '../.e2e_output/poetas4_cookie_official.mp3');

  for (const b of browsers) {
    console.log(`\nTrying cookies from browser: ${b}...`);
    try {
      await youtubedl('https://www.youtube.com/watch?v=PAMdKQu7aPg', {
        extractAudio: true,
        audioFormat: 'mp3',
        output: outputPath,
        noCheckCertificates: true,
        cookiesFromBrowser: b,
      });

      const stat = fs.statSync(outputPath);
      console.log(`🎉 MASSIVE SUCCESS with browser ${b}! Downloaded ${(stat.size / 1024 / 1024).toFixed(2)} MB of official MP3 audio!`);
      return;
    } catch (e) {
      console.log(`  -> Failed with browser ${b}:`, (e.stderr || e.message).slice(0, 150));
    }
  }
}

testCookiesBrowser();
