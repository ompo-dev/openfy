import * as React from 'react';
import { Text, View } from 'react-native';
import { CollectionDetail } from '../components/CollectionDetail';
import { usePersonalizedHome } from '../hooks';
import { getHomePlaylist, publishHomePlaylists, subscribeHomePlaylists } from '../services/home/temporaryPlaylists';

export function TemporaryPlaylistScreen({ playlistId }: { playlistId: string }) {
  const { home, isLoading, isRefreshing, refresh } = usePersonalizedHome();
  React.useEffect(() => { if (!isLoading) publishHomePlaylists(home); }, [home, isLoading]);
  const playlist = React.useSyncExternalStore(subscribeHomePlaylists,
    () => getHomePlaylist(playlistId), () => getHomePlaylist(playlistId));
  if (!playlist) return <View style={{ flex: 1, backgroundColor: '#101010' }}>
    {!isLoading ? <Text style={{ color: '#FFFFFF', margin: 24 }}>Playlist indisponível.</Text> : null}
  </View>;
  const tracks = playlist.tracks.map((track) => ({
    ...track, id: track.spotifyId, subtitle: track.artistName,
    durationMs: track.duration_ms, imageURL: track.localImagePath || track.imageURL,
  }));
  const covers = [...new Set(tracks.map((track) => track.imageURL).filter(Boolean))].slice(0, 4);
  return <CollectionDetail kind="playlist" collectionId={playlist.id} title={playlist.title}
    imageURL={covers[0] || ''} imageURLs={covers} tracks={tracks} trackCount={tracks.length}
    disableTrackArtistLinks onRefresh={refresh} refreshing={isRefreshing} />;
}
