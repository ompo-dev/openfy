/**
 * ImportModal Component
 * Allows users to paste a Spotify link and download the track/playlist/album
 */

import * as React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppIcon as Ionicons, AppIcon as MaterialCommunityIcons } from '../native/AppIcon';

import {
  getDownloadedTracks,
  getLibraryTracks,
  getLocalPlaylists,
  isTrackDownloaded,
  parseSpotifyLink,
  upsertCatalogTracks,
  upsertLocalPlaylist,
} from '@services';
import { useDownloads, usePlayer } from '@context';
import { GlassSurface, LoggedPressable, SheetFrame } from '../native';
import { TrackRow } from '../common/TrackRow';
import { ProgressiveFlatList } from '../common/ProgressiveList';
import type { TrackAlbumRef } from '../../models/Track/TrackModel';

import {
  fetchSpotifyCollectionMetadata,
  fetchSpotifyTrackMetadata,
  type SpotifyArtist,
} from '../../services/metadata/spotifyMetadata';
import axios from 'axios';
import { useConnectivityStore } from '../../stores/useConnectivityStore';
import { showOfflineActionMessage } from '../../services/network/offlineFeedback';

type TrackPreview = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  artists?: SpotifyArtist[];
  albumId?: string;
  albumAssociations?: TrackAlbumRef[];
  albumArtists?: SpotifyArtist[];
  trackNumber?: number;
  discNumber?: number;
  imageURL: string;
  duration_ms: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  audioUrl?: string;
  audioFormat?: string;
  isDownloaded?: boolean;
};

type ImportModalProps = {
  visible: boolean;
  initialInput?: string;
  onClose: () => void;
  onLibraryChanged?: () => void;
};

type ImportedPlaylist = {
  sourcePlatform: 'spotify' | 'youtube';
  sourceId: string;
  title: string;
};

const YOUTUBE_STREAM_UNAVAILABLE_ERROR = 'YOUTUBE_STREAM_UNAVAILABLE';
const YOUTUBE_STREAM_UNAVAILABLE_MESSAGE =
  'YouTube bloqueou o stream de áudio desse vídeo. Metadados foram encontrados, mas o download não pode começar sem áudio.';

const fetchPlaylistOrAlbum = async (
  id: string,
  type: 'playlist' | 'album'
): Promise<{ title: string; coverUrl: string; tracks: TrackPreview[] }> => {
  const collection = await fetchSpotifyCollectionMetadata(id, type);
  if (!collection) return { title: '', coverUrl: '', tracks: [] };
  const downloadedIds = new Set(
    (await getDownloadedTracks()).map((track) => track.spotifyId)
  );
  return {
    ...collection,
    tracks: collection.tracks.map((track) => ({
      ...track,
      isDownloaded: downloadedIds.has(track.spotifyId),
    })),
  };
};

const fetchYouTubeTrack = async (
  videoId: string
): Promise<TrackPreview | null> => {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const trackId = `yt_${videoId}`;
  const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
  const timer = setTimeout(() => controller?.abort(), 7000);
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      { signal: controller?.signal }
    );
    if (!response.ok) return null;
    const metadata = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!metadata.title) return null;
    return {
      spotifyId: trackId,
      title: metadata.title,
      artistName: metadata.author_name || 'YouTube',
      albumName: 'YouTube',
      imageURL:
        metadata.thumbnail_url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration_ms: 0,
      youtubeVideoId: videoId,
      youtubeUrl,
      isDownloaded: await isTrackDownloaded(trackId),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fetchYouTubePlaylist = async (
  playlistId: string
): Promise<{ title: string; tracks: TrackPreview[] }> => {
  const gateways = [
    `https://inv.nadeko.net/api/v1/playlists/${playlistId}`,
    `https://invidious.f5.si/api/v1/playlists/${playlistId}`,
  ];

  for (const gw of gateways) {
    try {
      const res = await axios.get(gw, { timeout: 6000 });
      const data = res.data;
      if (data && data.videos && Array.isArray(data.videos)) {
        const downloadedIds = new Set((await getDownloadedTracks()).map((track) => track.spotifyId));
        const list: TrackPreview[] = [];
        for (const v of data.videos) {
          const trackId = `yt_${v.videoId}`;
          const already = downloadedIds.has(trackId);
          list.push({
            spotifyId: trackId,
            title: v.title || 'Música',
            artistName: v.author || data.author || 'YouTube Music',
            albumName: data.title || 'YouTube Playlist',
            imageURL:
              v.videoThumbnails?.[0]?.url ||
              `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            duration_ms: (v.lengthSeconds || 0) * 1000,
            youtubeVideoId: v.videoId,
            isDownloaded: already,
          });
        }
        if (list.length > 0) {
          return { title: data.title || 'YouTube Playlist', tracks: list };
        }
      }
    } catch {}
  }
  return { title: '', tracks: [] };
};

export const ImportModal = ({
  visible,
  initialInput,
  onClose,
  onLibraryChanged,
}: ImportModalProps) => {
  const [inputText, setInputText] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [tracks, setTracks] = React.useState<TrackPreview[]>([]);
  const [error, setError] = React.useState('');
  const [savedKey, setSavedKey] = React.useState('');
  const persistedKey = React.useRef('');
  const importPending = React.useRef(false);
  const resolvedImport = React.useRef<{ key: string; tracks: TrackPreview[]; playlist: ImportedPlaylist | null } | null>(null);
  const parsedInput = parseSpotifyLink(inputText.trim());
  const inputKey = parsedInput ? `${parsedInput.platform}:${parsedInput.type}:${parsedInput.id}` : '';
  const added = Boolean(inputKey && savedKey === inputKey);
  const { currentTrack, isPlaying, playWithQueue } = usePlayer((state) => ({
    currentTrack: state.currentTrack, isPlaying: state.playerState.isPlaying, playWithQueue: state.playWithQueue,
  }));
  const { downloads, enqueueDownloads } = useDownloads();
  const downloadsById = React.useMemo(
    () => new Map(downloads.map((download) => [download.spotifyId, download])),
    [downloads]
  );
  const isOffline = useConnectivityStore((state) => state.status === 'offline');

  React.useEffect(() => {
    if (!visible || !initialInput || importPending.current) return;
    setInputText(initialInput);
    setError('');
    const parsed = parseSpotifyLink(initialInput.trim());
    const key = parsed ? `${parsed.platform}:${parsed.type}:${parsed.id}` : '';
    if (resolvedImport.current?.key !== key) setTracks([]);
  }, [initialInput, visible]);

  React.useEffect(() => {
    const resolved = resolvedImport.current;
    if (!visible || !resolved || importPending.current) return;
    let active = true;
    void Promise.all([getLibraryTracks(), resolved.playlist ? getLocalPlaylists() : Promise.resolve([])])
      .then(([savedTracks, playlists]) => {
        if (!active || importPending.current || resolvedImport.current !== resolved) return;
        const ids = new Set(savedTracks.map((track) => track.spotifyId));
        const stillSaved = resolved.tracks.every((track) => ids.has(track.spotifyId)) &&
          (!resolved.playlist || playlists.some((playlist) => playlist.sourcePlatform === resolved.playlist?.sourcePlatform &&
            playlist.sourceId === resolved.playlist.sourceId));
        if (!stillSaved && persistedKey.current === resolved.key) {
          persistedKey.current = '';
          setSavedKey('');
        }
      }).catch(() => {});
    return () => { active = false; };
  }, [visible]);

  const handleClose = () => {
    onClose();
  };

  const changeInput = (text: string) => {
    if (importPending.current) return;
    setInputText(text);
    setError('');
    const parsed = parseSpotifyLink(text.trim());
    const key = parsed ? `${parsed.platform}:${parsed.type}:${parsed.id}` : '';
    setTracks(resolvedImport.current?.key === key ? resolvedImport.current.tracks : []);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      changeInput(text);
    } catch {
      setError('Não foi possível acessar a área de transferência.');
    }
  };

  const handleImport = async () => {
    if (importPending.current || added || (inputKey && persistedKey.current === inputKey)) return;
    if (isOffline) {
      showOfflineActionMessage();
      return;
    }
    if (!inputText.trim()) {
      setError('Por favor, cole um link do Spotify ou YouTube Music.');
      return;
    }

    const parsed = parseSpotifyLink(inputText.trim());
    if (!parsed) {
      setError(
        'Link inválido. Use um link do Spotify (música, álbum, playlist) ou YouTube/YT Music.'
      );
      return;
    }

    importPending.current = true;
    setIsLoading(true);
    setError('');
    setTracks([]);

    try {
      let tracksToShow: TrackPreview[] = [];
      let playlistToSave: ImportedPlaylist | null = null;

      if (resolvedImport.current?.key === inputKey) {
        tracksToShow = resolvedImport.current.tracks;
        playlistToSave = resolvedImport.current.playlist;
      } else if (parsed.platform === 'youtube') {
        if (parsed.type === 'track') {
          const ytTrack = await fetchYouTubeTrack(parsed.id);
          if (ytTrack) tracksToShow = [ytTrack];
        } else if (parsed.type === 'playlist') {
          const result = await fetchYouTubePlaylist(parsed.id);
          tracksToShow = result.tracks;
          playlistToSave = {
            sourcePlatform: 'youtube',
            sourceId: parsed.id,
            title: result.title,
          };
        }
      } else {
        // Spotify
        if (parsed.type === 'track') {
          const track = await fetchSpotifyTrackMetadata(parsed.id);
          if (track) {
            const alreadyDownloaded = await isTrackDownloaded(track.spotifyId);
            tracksToShow = [{ ...track, isDownloaded: alreadyDownloaded }];
          }
        } else if (parsed.type === 'playlist' || parsed.type === 'album') {
          const result = await fetchPlaylistOrAlbum(parsed.id, parsed.type);
          tracksToShow = result.tracks;
          if (parsed.type === 'playlist') {
            playlistToSave = {
              sourcePlatform: 'spotify',
              sourceId: parsed.id,
              title: result.title,
            };
          }
        }
      }

      if (tracksToShow.length === 0) {
        setError(
          parsed.platform === 'youtube'
            ? YOUTUBE_STREAM_UNAVAILABLE_MESSAGE
            : 'Nenhuma música encontrada. Verifique o link e tente novamente.'
        );
      } else {
        resolvedImport.current = { key: inputKey, tracks: tracksToShow, playlist: playlistToSave };
        setTracks(tracksToShow);
        await upsertCatalogTracks(tracksToShow);
        if (playlistToSave) {
          await upsertLocalPlaylist({
            ...playlistToSave,
            trackIds: tracksToShow.map((track) => track.spotifyId),
            coverImageURLs: tracksToShow
              .map((track) => track.imageURL)
              .filter(Boolean),
          });
        }
        persistedKey.current = inputKey;
        setSavedKey(inputKey);
        onLibraryChanged?.();
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === YOUTUBE_STREAM_UNAVAILABLE_ERROR
          ? YOUTUBE_STREAM_UNAVAILABLE_MESSAGE
          : 'Erro ao buscar dados. Verifique o link e tente novamente.'
      );
      console.error('[ImportModal] handleImport error:', err);
    } finally {
      importPending.current = false;
      setIsLoading(false);
    }
  };

  const toDownloadInput = React.useCallback(
    (track: TrackPreview) => ({
      spotifyId: track.spotifyId,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
      artists: track.artists,
      albumId: track.albumId,
      albumAssociations: track.albumAssociations,
      albumArtists: track.albumArtists,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber,
      imageURL: track.imageURL,
      duration_ms: track.duration_ms,
      youtubeVideoId: track.youtubeVideoId,
      youtubeUrl: track.youtubeUrl,
      audioUrl: track.audioUrl,
      audioFormat: track.audioFormat,
    }),
    []
  );

  const handleDownloadTrack = (track: TrackPreview) => {
    const download = downloadsById.get(track.spotifyId);
    if (track.isDownloaded || ['completed', 'queued', 'resolving', 'downloading'].includes(download?.status || '')) return;
    enqueueDownloads([toDownloadInput(track)]);
  };

  const handleDownloadAll = () => {
    enqueueDownloads(
      tracks
        .filter((track) => {
          const download = downloadsById.get(track.spotifyId);
          return !track.isDownloaded && !['completed', 'queued', 'resolving', 'downloading'].includes(download?.status || '');
        })
        .map(toDownloadInput)
    );
  };

  const downloadableCount = tracks.filter((track) => {
    const download = downloadsById.get(track.spotifyId);
    return !track.isDownloaded && !['completed', 'queued', 'resolving', 'downloading'].includes(download?.status || '');
  }).length;

  const inputSection = (
    <View style={styles.inputSection}>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Link da música, álbum ou playlist"
          style={styles.textInput}
          value={inputText}
          onChangeText={changeInput}
          editable={!isLoading}
          placeholder="Link do Spotify ou YouTube"
          placeholderTextColor="#8E8E93"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void handleImport()}
        />
        <LoggedPressable accessibilityLabel="Colar link" disabled={isLoading}
          onPress={() => void handlePasteFromClipboard()}>
          <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={21} color="#FFFFFF" />
          </GlassSurface>
        </LoggedPressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      {!added ? (
        <LoggedPressable accessibilityRole="button" accessibilityLabel="Adicionar à biblioteca"
          disabled={isLoading} onPress={() => void handleImport()}>
          <GlassSurface glass="regular" isInteractive style={[styles.importButton, isLoading && styles.disabled]}>
            {isLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <>
              <Ionicons name="add" size={20} color="#1ED760" />
              <Text style={styles.actionText}>Adicionar à biblioteca</Text>
            </>}
          </GlassSurface>
        </LoggedPressable>
      ) : null}
      {tracks.length ? (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'}{added ? ' na biblioteca' : ''}
          </Text>
          {downloadableCount ? (
            <LoggedPressable accessibilityRole="button" accessibilityLabel="Baixar todas as músicas"
              onPress={handleDownloadAll}>
              <GlassSurface glass="regular" isInteractive style={styles.downloadAllButton}>
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.actionText}>Baixar</Text>
              </GlassSurface>
            </LoggedPressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SheetFrame visible={visible} title="Adicionar músicas" onClose={handleClose}
      scroll={false} artworkURL={tracks[0]?.imageURL}
      contentHeight={(added ? 128 : tracks.length ? 184 : 132) + (error ? 36 : 0) + tracks.length * 64}>
      <ProgressiveFlatList
        listKey={inputKey}
        data={tracks}
        keyExtractor={(track) => track.spotifyId}
        ListHeaderComponent={inputSection}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const status = downloadsById.get(item.spotifyId)?.status;
          return <TrackRow title={item.title} subtitle={item.artistName} imageURL={item.imageURL}
            active={currentTrack?.spotifyId === item.spotifyId} playing={isPlaying}
            downloadState={item.isDownloaded || status === 'completed' ? 'completed' :
              ['queued', 'resolving', 'downloading'].includes(status || '') ? 'active' : 'idle'}
            onDownload={() => handleDownloadTrack(item)}
            onPress={() => void playWithQueue(
              tracks.map((track) => ({ ...toDownloadInput(track), streamUrl: track.audioUrl })),
              index, `import:${inputKey}`
            )} />;
        }}
      />
    </SheetFrame>
  );
};

const styles = StyleSheet.create({
  inputSection: { gap: 12, paddingBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textInput: { flex: 1, minWidth: 0, height: 44, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8, paddingHorizontal: 12, color: '#FFFFFF', fontSize: 14, fontFamily: 'SF-Regular' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  importButton: { minHeight: 44, borderRadius: 8, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.6 },
  actionText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'SF-Semibold' },
  errorText: { color: '#FF6969', fontSize: 12, fontFamily: 'SF-Regular' },
  resultsHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resultsCount: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'SF-Regular' },
  downloadAllButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
});
