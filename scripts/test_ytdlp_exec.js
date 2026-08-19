const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

async function testYtDlp(videoId) {
  console.log(`Extracting direct audio using youtube-dl-exec (yt-dlp) for video ${videoId}...`);
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const output = await youtubedl(ytUrl, {
      getUrl: true,
      format: 'bestaudio[ext=m4a]/bestaudio',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:googlebot'
      ]
    });

    console.log('✅ Direct Audio Stream URL obtained:');
    console.log(output);

    const streamUrl = String(output).trim();
    if (streamUrl.startsWith('http')) {
      const headRes = await fetch(streamUrl, { method: 'HEAD' });
      console.log('Audio Stream HTTP Status:', headRes.status, 'Content-Type:', headRes.headers.get('content-type'), 'Content-Length:', headRes.headers.get('content-length'));
    }
  } catch (e) {
    console.error('youtube-dl-exec error:', e);
  }
}

testYtDlp('PAMdKQu7aPg');
