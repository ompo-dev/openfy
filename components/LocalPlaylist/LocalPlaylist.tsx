import * as React from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  addTracksToLocalPlaylist,
  deleteLocalPlaylist,
  getLibraryTracks,
  getLocalPlaylist,
  type LibraryTrack,
  type LocalPlaylist as LocalPlaylistModel,
} from '@services';
import { useLibrarySelectedCategory } from '@context';
import { CollectionDetail } from '../CollectionDetail';
import { PlaylistEditorModal } from './PlaylistEditorModal';
import { PlaylistTrackPickerModal } from './PlaylistTrackPickerModal';

export const LocalPlaylist = ({ playlistId }: { playlistId: string }) => {
  const router = useRouter();
  const { refreshLibrary } = useLibrarySelectedCategory();
  const [playlist, setPlaylist] = React.useState<LocalPlaylistModel | null>(null);
  const [libraryTracks, setLibraryTracks] = React.useState<LibraryTrack[]>([]);
  const [tracks, setTracks] = React.useState<LibraryTrack[]>([]);
  const [isPickerVisible, setIsPickerVisible] = React.useState(false);
  const [isEditorVisible, setIsEditorVisible] = React.useState(false);

  const loadPlaylist = React.useCallback(async () => {
    const [localPlaylist, downloaded] = await Promise.all([
      getLocalPlaylist(playlistId),
      getLibraryTracks(),
    ]);
    setPlaylist(localPlaylist);
    const downloadedById = new Map(
      downloaded.map((track) => [track.spotifyId, track])
    );
    setLibraryTracks(downloaded);
    setTracks(
      localPlaylist
        ? localPlaylist.trackIds
            .map((trackId) => downloadedById.get(trackId))
            .filter((track): track is LibraryTrack => Boolean(track))
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
      await addTracksToLocalPlaylist(playlist.id, trackIds);
      await loadPlaylist();
      refreshLibrary();
    },
    [loadPlaylist, playlist, refreshLibrary]
  );

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
    artists: track.artists,
    albumId: track.albumId,
    albumArtists: track.albumArtists,
    youtubeVideoId: track.youtubeVideoId,
    youtubeUrl: track.youtubeUrl,
    audioUrl: track.audioUrl,
    isDownloaded: track.isDownloaded,
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
        description={
          playlist.description ||
          (playlist.sourcePlatform === 'local'
            ? 'Playlist criada no Openfy.'
            : `Playlist importada do ${
                playlist.sourcePlatform === 'spotify' ? 'Spotify' : 'YouTube'
              }.`)
        }
        createdAt={playlist.createdAt}
        onAddTracksPress={() => setIsPickerVisible(true)}
        onDeletePress={confirmDelete}
        onEditPress={() => setIsEditorVisible(true)}
        disableTrackArtistLinks
        trackCount={playlist.trackIds.length}
        tracks={collectionTracks}
      />
      <PlaylistEditorModal
        onAddTracks={() => {
          setTimeout(() => setIsPickerVisible(true), 220);
        }}
        onClose={() => setIsEditorVisible(false)}
        onSaved={async () => {
          await loadPlaylist();
          refreshLibrary();
        }}
        playlist={playlist}
        tracks={tracks}
        visible={isEditorVisible}
      />
      <PlaylistTrackPickerModal
        existingTrackIds={playlist.trackIds}
        onClose={() => setIsPickerVisible(false)}
        onConfirm={(trackIds) => void addTracks(trackIds)}
        tracks={libraryTracks}
        visible={isPickerVisible}
      />
    </>
  );
};
