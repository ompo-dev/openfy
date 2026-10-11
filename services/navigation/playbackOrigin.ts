export type PlaybackOrigin = { kind: 'album' | 'playlist' | 'artist'; id: string };

export const getPlaybackOrigin = (sourceId?: string | null): PlaybackOrigin | null => {
  if (!sourceId) return null;
  const [kind, id] = sourceId.split(':');
  // Older local queues used the catalog key instead of the navigable album route.
  if (kind === 'album' && id === 'spotify') {
    const albumId = sourceId.split(':')[2];
    if (albumId) return { kind, id: `local_album_${encodeURIComponent(`spotify:${albumId}`)}` };
  }
  if (kind === 'album' && sourceId.includes('\u0000')) {
    return { kind, id: `local_album_${encodeURIComponent(sourceId.slice('album:'.length))}` };
  }
  if (kind === 'album' && /^(MPRE|OLAK5uy)/.test(id)) return { kind, id: `ytalbum_${encodeURIComponent(id)}` };
  if ((kind === 'album' || kind === 'playlist' || kind === 'artist') && id) return { kind, id };
  if (kind === 'home') {
    const playlist = { recent: 'home_mix_recent', 'most-played': 'home_mix_most_played', discover: 'home_mix_discover' }[id];
    if (playlist) return { kind: 'playlist', id: playlist };
  }
  if (kind === 'import') {
    const [, platform, type, importedId] = sourceId.split(':');
    if ((platform === 'spotify' || platform === 'youtube') && importedId) {
      if (type === 'album') return { kind: 'album', id: `local_album_${encodeURIComponent(`spotify:${importedId}`)}` };
      if (type === 'playlist') return { kind: 'playlist', id: `local_${platform}_${importedId}` };
    }
  }
  return null;
};
