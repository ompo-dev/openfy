import * as React from 'react';
import { Alert, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  deleteLocalPlaylist,
  getDownloadedTracks,
  getLocalPlaylist,
  upsertLocalPlaylist,
  type DownloadedTrack,
  type LocalPlaylist as LocalPlaylistModel,
} from '@services';
import { useLibrarySelectedCategory } from '@context';
import { CollectionDetail } from '../CollectionDetail';
import { PlaylistTrackPickerModal } from './PlaylistTrackPickerModal';

export const LocalPlaylist = ({ playlistId }: { playlistId: string }) => {
  const router = useRouter();
  const { refreshLibrary } = useLibrarySelectedCategory();
  const [playlist, setPlaylist] = React.useState<LocalPlaylistModel | null>(null);
  const [downloadedTracks, setDownloadedTracks] = React.useState<DownloadedTrack[]>([]);
  const [tracks, setTracks] = React.useState<DownloadedTrack[]>([]);
  const [isPickerVisible, setIsPickerVisible] = React.useState(false);

  const loadPlaylist = React.useCallback(async () => {
    const [localPlaylist, downloaded] = await Promise.all([
      getLocalPlaylist(playlistId),
      getDownloadedTracks(),
    ]);
    setPlaylist(localPlaylist);
    const downloadedById = new Map(
      downloaded.map((track) => [track.spotifyId, track])
    );
    setDownloadedTracks(downloaded);
    setTracks(
      localPlaylist
        ? localPlaylist.trackIds
            .map((trackId) => downloadedById.get(trackId))
            .filter((track): track is DownloadedTrack => Boolean(track))
        : []
    );
  }, [playlistId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadPlaylist();
    }, [loadPlaylist])
  );

  const addTracks = React.useCallback(
    async (trackIds: string[]) => {
      if (!playlist || trackIds.length === 0) return;
      await upsertLocalPlaylist({
        sourcePlatform: playlist.sourcePlatform,
        sourceId: playlist.sourceId,
        title: playlist.title,
        trackIds: [...playlist.trackIds, ...trackIds],
        coverImageURLs: playlist.coverImageURLs,
      });
      await loadPlaylist();
      refreshLibrary();
    },
    [loadPlaylist, playlist, refreshLibrary]
  );

  const copyPlaylistLink = React.useCallback(async () => {
    if (!playlist) return;
    const sourceLink =
      playlist.sourcePlatform === 'spotify'
        ? `https://open.spotify.com/playlist/${encodeURIComponent(playlist.sourceId)}`
        : `https://www.youtube.com/playlist?list=${encodeURIComponent(playlist.sourceId)}`;
    await Clipboard.setStringAsync(sourceLink);
    Alert.alert('Link copiado', 'Link da playlist copiado para a área de transferência.');
  }, [playlist]);

  const confirmDelete = React.useCallback(() => {
    if (!playlist) return;
    Alert.alert(
      'Excluir playlist?',
      `"${playlist.title}" será removida. As músicas baixadas continuarão na biblioteca.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await deleteLocalPlaylist(playlist.id);
              refreshLibrary();
              router.replace('/(tabs)/library');
            })();
          },
        },
      ]
    );
  }, [playlist, refreshLibrary, router]);

  if (!playlist) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  const collectionTracks = tracks.map((track) => ({
    id: track.spotifyId,
    title: track.title,
    subtitle: track.artistName,
    albumName: track.albumName,
    imageURL: track.localImagePath || track.imageURL,
    durationMs: track.duration_ms,
    isDownloaded: true,
    localAudioPath: track.localAudioPath,
  }));
  const imageURLs = [
    ...collectionTracks.map((track) => track.imageURL),
    ...(playlist.coverImageURLs || []),
  ].filter((url): url is string => Boolean(url));
  const imageURL = imageURLs[0] || '';

  return (
    <>
      <CollectionDetail
        kind="playlist"
        collectionId={playlist.id}
        title={playlist.title}
        imageURL={imageURL}
        imageURLs={[...new Set(imageURLs)].slice(0, 4)}
        description={`Playlist importada do ${
          playlist.sourcePlatform === 'spotify' ? 'Spotify' : 'YouTube'
        }.`}
        createdAt={playlist.createdAt}
        onAddTracksPress={() => setIsPickerVisible(true)}
        onDeletePress={confirmDelete}
        onSharePress={copyPlaylistLink}
        trackCount={playlist.trackIds.length}
        tracks={collectionTracks}
      />
      <PlaylistTrackPickerModal
        existingTrackIds={playlist.trackIds}
        onClose={() => setIsPickerVisible(false)}
        onConfirm={(trackIds) => void addTracks(trackIds)}
        tracks={downloadedTracks}
        visible={isPickerVisible}
      />
    </>
  );
};
