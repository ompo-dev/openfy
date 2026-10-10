import * as React from 'react';
import { Alert } from 'react-native';
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
import { PendingCollectionDetail } from '../CollectionDetail/PendingCollectionDetail';
import { getDetailPreview } from '../../services/navigation/detailPreview';

const hasArtistCredit = (track: LibraryTrack) => {
  const names = [
    ...(track.artists || []).map((artist) => artist.name),
    ...track.artistName.split(/\s*(?:,|&|feat\.?|ft\.?|·)\s*/i),
  ];
  return names.some((value) => {
    const name = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase();
    return name.length > 0 && ![
      'artista',
      'artista desconhecido',
      'artista nao identificado',
      'desconhecido',
      'unknown',
      'unknown artist',
    ].includes(name);
  });
};

export const LocalPlaylist = ({ playlistId }: { playlistId: string }) => {
  const router = useRouter();
  const { refreshLibrary } = useLibrarySelectedCategory();
  const [playlist, setPlaylist] = React.useState<LocalPlaylistModel | null>(null);
  const [libraryTracks, setLibraryTracks] = React.useState<LibraryTrack[]>([]);
  const [tracks, setTracks] = React.useState<LibraryTrack[]>([]);
  const [isPickerVisible, setIsPickerVisible] = React.useState(false);
  const [isEditorVisible, setIsEditorVisible] = React.useState(false);
  const [loadingTracks, setLoadingTracks] = React.useState(true);
  const [error, setError] = React.useState('');
  const generationRef = React.useRef(0);

  const loadPlaylist = React.useCallback(async () => {
    const generation = ++generationRef.current;
    setLoadingTracks(true);
    setError('');
    try {
      const [localPlaylist, downloaded] = await Promise.all([
        getLocalPlaylist(playlistId).then((data) => {
          if (generation === generationRef.current) {
            setPlaylist(data);
            if (!data) setError('Playlist não encontrada.');
          }
          return data;
        }),
        getLibraryTracks(),
      ]);
      if (generation !== generationRef.current) return;
      const downloadedById = new Map(
        downloaded.map((track) => [track.spotifyId, track])
      );
      setLibraryTracks(downloaded);
      setTracks(
        localPlaylist
          ? localPlaylist.trackIds
              .map((trackId) => downloadedById.get(trackId))
              .filter(
                (track): track is LibraryTrack =>
                  track !== undefined && hasArtistCredit(track)
              )
          : []
      );
    } catch {
      if (generation === generationRef.current) setError('Não foi possível carregar esta playlist.');
    } finally {
      if (generation === generationRef.current) setLoadingTracks(false);
    }
  }, [playlistId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadPlaylist();
      return () => { generationRef.current++; };
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

  if (!playlist) return <PendingCollectionDetail kind="playlist" collectionId={playlistId} error={error}
    onRetry={() => void loadPlaylist()} />;

  const collectionTracks = tracks.map((track) => ({
    id: track.spotifyId,
    title: track.title,
    subtitle: track.artistName,
    albumName: track.albumName,
    imageURL: track.localImagePath || track.imageURL,
    durationMs: track.duration_ms,
    artists: track.artists,
    albumId: track.albumId,
    albumAssociations: track.albumAssociations,
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
    ...(loadingTracks ? getDetailPreview('playlist', playlistId)?.imageURLs || [] : []),
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
        description={playlist.description}
        createdAt={playlist.createdAt}
        onAddTracksPress={() => setIsPickerVisible(true)}
        onDeletePress={confirmDelete}
        onEditPress={() => setIsEditorVisible(true)}
        disableTrackArtistLinks
        trackCount={loadingTracks ? playlist.trackIds.length : tracks.length}
        tracks={collectionTracks}
        loadingTracks={loadingTracks}
        loadingError={error}
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
