import { stableDirectAudioUrl } from '../stableAudioUrl';

it('recognizes permanent progressive audio and its format', () => {
  expect(stableDirectAudioUrl('https://media.example/file.m4a')).toEqual({ url: 'https://media.example/file.m4a', format: 'm4a' });
});

it.each(['file:///private/audio.m4a', 'https://rr.googlevideo.com/audio.mp3', 'https://media.example/audio.mp3?token=secret',
  'https://media.example/master.m3u8', 'https://username:password@media.example/audio.mp3'])(
  'does not treat temporary, credentialed or non-progressive sources as permanent: %s', (url) => {
    expect(stableDirectAudioUrl(url)).toBeNull();
  });
