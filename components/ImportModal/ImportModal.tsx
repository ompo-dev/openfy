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

import { parseSpotifyLink } from '@services';
import { useDownloads, usePlayer } from '@context';
import { GlassSurface, LoggedPressable, SheetFrame } from '../native';
import { TrackRow } from '../common/TrackRow';
import { ProgressiveFlatList } from '../common/ProgressiveList';
import { getImportJob, revalidateImport, startLibraryImport, subscribeImports, type TrackPreview } from '../../services/library/libraryImports';
import { useConnectivityStore } from '../../stores/useConnectivityStore';
import { showOfflineActionMessage } from '../../services/network/offlineFeedback';

type ImportModalProps = {
  visible: boolean;
  initialInput?: string;
  onClose: () => void;
  onLibraryChanged?: () => void;
};

export const ImportModal = ({
  visible,
  initialInput,
  onClose,
  onLibraryChanged,
}: ImportModalProps) => {
  const [inputText, setInputText] = React.useState('');
  const [error, setError] = React.useState('');
  const [, updateJob] = React.useReducer((revision) => revision + 1, 0);
  const parsedInput = parseSpotifyLink(inputText.trim());
  const inputKey = parsedInput ? `${parsedInput.platform}:${parsedInput.type}:${parsedInput.id}` : '';
  const job = getImportJob(inputKey);
  const isLoading = job?.status === 'loading';
  const tracks = job?.tracks || [];
  const added = job?.status === 'completed';
  const displayedError = error || job?.error || '';
  const { currentTrack, isPlaying, playWithQueue } = usePlayer((state) => ({
    currentTrack: state.currentTrack, isPlaying: state.playerState.isPlaying, playWithQueue: state.playWithQueue,
  }));
  const { downloads, enqueueDownloads } = useDownloads();
  const downloadsById = React.useMemo(
    () => new Map(downloads.map((download) => [download.spotifyId, download])),
    [downloads]
  );
  const isOffline = useConnectivityStore((state) => state.status === 'offline');

  React.useEffect(() => subscribeImports((updated) => {
    if (updated.key === inputKey) updateJob();
    if (updated.status === 'completed') onLibraryChanged?.();
  }), [inputKey, onLibraryChanged]);

  React.useEffect(() => {
    if (visible && initialInput) { setInputText(initialInput); setError(''); }
  }, [initialInput, visible]);

  React.useEffect(() => {
    if (visible && inputKey) void revalidateImport(inputKey).catch(() => {});
  }, [inputKey, visible]);

  const handleClose = onClose;
  const changeInput = (text: string) => { setInputText(text); setError(''); };
  const handlePasteFromClipboard = async () => {
    try { changeInput(await Clipboard.getStringAsync()); }
    catch { setError('Não foi possível acessar a área de transferência.'); }
  };
  const handleImport = () => {
    if (isLoading || added) return;
    if (isOffline) { showOfflineActionMessage(); return; }
    if (!parsedInput) {
      setError('Link inválido. Use um link do Spotify (música, álbum, playlist) ou YouTube/YT Music.');
      return;
    }
    setError('');
    void startLibraryImport(inputText).catch(() => setError('Não foi possível iniciar a importação.'));
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
      {displayedError ? <Text accessibilityRole="alert" style={styles.errorText}>{displayedError}</Text> : null}
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
      contentHeight={(added ? 128 : tracks.length ? 184 : 132) + (displayedError ? 36 : 0) + tracks.length * 64}>
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
          return <TrackRow track={item} title={item.title} subtitle={item.artistName} imageURL={item.imageURL}
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
