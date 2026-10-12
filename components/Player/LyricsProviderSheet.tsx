import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SheetFrame, AppIcon, LoggedPressable, NativeIconButton } from '../native';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { LYRICS_PROVIDERS, lyricsProviderName, type LyricsProviderSelection } from '../../services/lyrics/lyricsSources';
import { log } from '../../utils/appLogger';
import { probeLyricsProviders } from '../../services/lyrics/lyricsRepository';
import type { LyricsData } from '../../services/lyrics/lyricsService';
import { useConnectivityStore } from '../../stores/useConnectivityStore';

export const LyricsProviderSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const track = usePlayerStore((state) => state.currentTrack);
  const selected = usePlayerStore((state) => state.lyricsProvider);
  const attempts = usePlayerStore((state) => state.lyricsProviderAttempts);
  const lyrics = usePlayerStore((state) => state.lyricsData);
  const loading = usePlayerStore((state) => state.isLoadingLyrics);
  const disabled = useAppSettingsStore((state) => state.settings.lyricsDisabledSources);
  const enabled = useAppSettingsStore((state) => state.settings.lyricsEnabled);
  const order = useAppSettingsStore((state) => state.settings.lyricsSourceOrder);
  const [error, setError] = React.useState('');
  const [available, setAvailable] = React.useState<Partial<Record<LyricsProviderSelection, LyricsData>>>({});
  const [probing, setProbing] = React.useState(false);
  const [refresh, setRefresh] = React.useState({ trackId: '', version: 0 });
  const { spotifyId: trackId, title, artistName, duration_ms: durationMs = 0, albumName, isrc } = track || {};
  const videoId = track?.youtubeVideoId || track?.videoId || (trackId?.startsWith('yt_') ? trackId.slice(3) : undefined);
  const query = React.useMemo(() => trackId ? { trackId, trackName: title || '',
    artistName: artistName || '', durationMs, albumName, isrc, videoId } : null,
  [trackId, title, artistName, durationMs, albumName, isrc, videoId]);
  React.useEffect(() => {
    if (!visible || !query || !enabled) return;
    const controller = new AbortController();
    setAvailable({}); setProbing(true);
    void probeLyricsProviders({ ...query,
      offline: useConnectivityStore.getState().status === 'offline', signal: controller.signal, force: refresh.trackId === query.trackId && refresh.version > 0 },
    (provider, result) => setAvailable((current) => ({ ...current, [provider]: result })))
      .finally(() => { if (!controller.signal.aborted) setProbing(false); });
    return () => controller.abort();
  }, [visible, query, enabled, order, disabled, refresh]);
  React.useEffect(() => { setError(''); }, [track?.spotifyId, visible]);
  React.useEffect(() => {
    if (!visible) return;
    log.ui('lyrics provider sheet opened');
    return () => log.ui('lyrics provider sheet closed');
  }, [visible]);
  const select = (provider: LyricsProviderSelection) => {
    log.ui('lyrics provider selected', { trackId: track?.spotifyId, provider });
    setError('');
    void usePlayerStore.getState().selectLyricsProvider(provider).catch(() => setError('Nao foi possivel salvar a escolha.'));
  };
  return <SheetFrame visible={visible} title="Provedor da letra" onClose={onClose}
    artworkURL={track?.imageURL} headerTrailing={<NativeIconButton label="Buscar letra novamente"
      systemImage="arrow.clockwise" iconName="refresh" onPress={() => {
        log.ui('lyrics provider refresh pressed', { trackId: track?.spotifyId, provider: selected });
        void usePlayerStore.getState().refreshLyrics(true);
        setRefresh((value) => ({ trackId: track?.spotifyId || '', version: value.version + 1 }));
      }} />}>
    <LoggedPressable accessibilityRole="radio" accessibilityState={{ checked: selected === 'auto' }}
      accessibilityLabel="Provedor automatico" onPress={() => select('auto')} style={styles.row}>
      <AppIcon name="sparkles" color="#FFFFFF" size={22} />
      <View style={styles.copy}><Text style={styles.name}>Automatico</Text>
        <Text style={styles.detail}>{!enabled ? 'Letras desativadas' : loading ? 'Buscando' : lyrics ? lyricsProviderName(lyrics.source) : 'Sem letra disponivel'}</Text></View>
      {selected === 'auto' ? <AppIcon name="checkmark" color="#1DB954" size={22} /> : null}
    </LoggedPressable>
    {probing ? <ActivityIndicator accessibilityLabel="Buscando provedores disponiveis" color="#FFFFFF" /> : null}
    {order.filter((id) => (available[id] || lyrics?.source === id) && enabled && !disabled.includes(id)).map((id) => {
      const provider = LYRICS_PROVIDERS.find((entry) => entry.id === id)!;
      const result = available[id] || (lyrics?.source === id ? lyrics : undefined);
      const unavailable = !enabled || disabled.includes(id);
      const status = result ? result.isSynced ? result.segments.some((line) => line.words?.length) ? 'Por palavra' : 'Sincronizada' : 'Texto' :
        unavailable ? 'Desativado' : attempts[id] === 'loading' ? 'Buscando' :
        attempts[id] === 'cancelled' ? 'Busca cancelada' :
        attempts[id] === 'timeout' ? 'Tempo de resposta esgotado' :
        attempts[id] === 'restricted' ? 'Acesso restrito pelo provedor (401/403)' :
        attempts[id] === 'missing' ? 'Letra nao encontrada' : attempts[id] === 'error' ? 'Falha no provedor' :
            attempts[id] === 'found' ? 'Disponivel' : provider.timing === 'word' ? 'Palavras / linhas' : provider.timing === 'line' ? 'Linhas' : 'Texto';
      return <LoggedPressable key={id} accessibilityRole="radio" accessibilityLabel={provider.name}
        accessibilityState={{ checked: selected === id, disabled: unavailable }} disabled={unavailable}
        onPress={() => select(id)} style={[styles.row, unavailable && styles.disabled]}>
        <AppIcon name="musical-note" color="#D0D0D5" size={21} />
        <View style={styles.copy}><Text style={styles.name}>{provider.name}</Text><Text style={styles.detail}>{status}</Text></View>
        {attempts[id] === 'loading' ? <ActivityIndicator color="#FFFFFF" /> : selected === id ?
          <AppIcon name="checkmark" color="#1DB954" size={22} /> : null}
      </LoggedPressable>;
    })}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </SheetFrame>;
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  copy: { flex: 1, minWidth: 0 }, name: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  detail: { color: '#B6B6BD', fontSize: 12, marginTop: 4 }, disabled: { opacity: 0.45 },
  error: { color: '#FF8585', paddingVertical: 12, fontSize: 13 },
});
