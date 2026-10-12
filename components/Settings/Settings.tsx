import * as React from 'react';
import {
  Alert,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppSettings } from '@context';
import { checkForOTAUpdateNow } from '@hooks';
import {
  clearUserProfile,
  clearHomeDiscoveryCache,
  getDownloadStorageInfo,
  getLibraryTracks,
  getLocalPlaylists,
  type AppSettings,
  type DownloadStorageInfo,
} from '@services';
import { AppIcon, GlassSurface, LoggedPressable, NativeIconButton, SheetFrame } from '../native';
import { AUDIO_QUALITY_LABELS } from '../../services/audio/audioPreferences';
import { getAudioCapabilities, getAudioOutputDiagnostics, getAudioDiagnosticsSnapshot, getPlayerState } from '../../services/audio/playerService';
import { usePlayerStore } from '../../stores/usePlayerStore';
import {
  clearLogBuffer,
  formatLogBuffer,
  formatPerformanceMetricSummary,
  getLogBuffer,
  getPerformanceMetricSummary,
  log,
  sanitizeLogData,
} from '../../utils/appLogger';
import { formatStorageSize, StorageManagerModal } from './StorageManagerModal';
import { AudioSettingsSheet } from './AudioSettingsSheet';
import { LyricsSettingsSheet } from './LyricsSettingsSheet';
import { clearImageCache } from '../../services/images/imagePrefetch';
import { AppText, Section as GymSection, SettingsRow, Toggle, Chevron, NativeSegmented, OptionMenu, useAppModalStore } from '../gym';
import { useSettingsModal } from '../gym/useSettingsModal';
import { SettingIcon } from '../gym/SettingIcon';
import { useTransientNotice } from '../../hooks/useTransientNotice';
import type { AppModalAnchor } from '../gym/appModals';

type LibrarySummary = {
  downloads: number;
  playlists: number;
  tracks: number;
};

const EMPTY_SUMMARY: LibrarySummary = { downloads: 0, playlists: 0, tracks: 0 };
const EMPTY_STORAGE: DownloadStorageInfo = { directory: '', totalBytes: 0, tracks: [] };
const GITHUB_URL = 'https://github.com/ompo-dev/openfy';

const SettingRow = ({
  description,
  icon,
  label,
  onValueChange,
  value,
}: {
  description?: string;
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) => (
  <SettingsRow title={label} subtitle={description} leading={
    <SettingIcon name={icon} />
  } trailing={<Toggle label={label}
      onValueChange={onValueChange}
      value={value}
    />} />
);

const ActionRow = ({
  detail,
  disabled = false,
  destructive = false,
  icon,
  label,
  onPress,
}: {
  detail?: string;
  disabled?: boolean;
  destructive?: boolean;
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  onPress: () => void;
}) => (
  <SettingsRow title={label} titleColor={destructive ? '#FF7A7A' : undefined}
    disabled={disabled}
    onPress={onPress}
    leading={
    <SettingIcon name={icon} color={destructive ? '#FF6B6B' : undefined} />
    } trailing={<View style={styles.actionTrailing}>
      {detail ? <AppText variant="secondary" numberOfLines={1} style={styles.detailText}>{detail}</AppText> : null}
      <Chevron />
    </View>} />
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <GymSection label={title}>{children}</GymSection>
);

export const Settings = ({ onClose }: { onClose?: () => void } = {}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, setSetting, resetSettings } = useAppSettings();
  const [summary, setSummary] = React.useState(EMPTY_SUMMARY);
  const [storage, setStorage] = React.useState(EMPTY_STORAGE);
  const [storageVisible, setStorageVisible] = useSettingsModal('settings.storage');
  const [audioVisible, setAudioVisible] = useSettingsModal('settings.audio');
  const [lyricsVisible, setLyricsVisible] = useSettingsModal('settings.lyrics');
  const [rootVisible, setRootVisible] = useSettingsModal('settings.root');
  const leaving = React.useRef(false);
  React.useEffect(() => {
    setRootVisible(true);
    return () => useAppModalStore.getState().closeAllAppModals();
  }, [setRootVisible]);
  const closeSettings = () => {
    if (leaving.current) return;
    leaving.current = true;
    useAppModalStore.getState().closeAllAppModals();
    if (onClose) onClose();
    else router.back();
  };
  const [updateStatus, setUpdateStatus] = React.useState('');
  const [checkingUpdate, setCheckingUpdate] = React.useState(false);
  const developerVisible = settings.developerTools;
  const [qualityPicker, setQualityPicker] = React.useState<'streamingQuality' | 'downloadQuality' | null>(null);
  const [qualityAnchor, setQualityAnchor] = React.useState<AppModalAnchor | null>(null);
  const streamingRow = React.useRef<View>(null);
  const downloadRow = React.useRef<View>(null);
  const [diagnosticsText, setDiagnosticsText] = React.useState<string | null>(null);
  const [clearingImages, setClearingImages] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  useTransientNotice(notice || undefined, () => setNotice(''), 6000, notice);
  const [saving, setSaving] = React.useState(false);
  const capabilities = getAudioCapabilities();
  const qualityOptions = (['high', 'economy'] as const).map((value) => ({ value, label: value === 'economy' ? 'Economia' : AUDIO_QUALITY_LABELS[value] }));
  const openQualityMenu = (key: 'streamingQuality' | 'downloadQuality') => {
    if (!capabilities.quality) { setNotice('A qualidade nativa requer o novo build do app.'); return; }
    const ref = key === 'streamingQuality' ? streamingRow : downloadRow;
    ref.current?.measureInWindow((x, y, width, height) => setQualityAnchor({ x, y, width, height }));
    setQualityPicker(key);
  };
  const [performanceMetrics, setPerformanceMetrics] = React.useState(
    getPerformanceMetricSummary
  );

  React.useEffect(() => {
    if (!developerVisible || !settings.captureLogs) return;
    setPerformanceMetrics(getPerformanceMetricSummary());
    const timer = setInterval(
      () => {
        if (AppState.currentState === 'active') setPerformanceMetrics(getPerformanceMetricSummary());
      },
      1_500
    );
    return () => clearInterval(timer);
  }, [developerVisible, settings.captureLogs]);

  React.useEffect(() => {
    let active = true;
    void Promise.all([getLibraryTracks(), getLocalPlaylists(), getDownloadStorageInfo()]).then(
      ([tracks, playlists, nextStorage]) => {
        if (!active) return;
        setSummary({
          downloads: tracks.filter((track) => track.isDownloaded).length,
          playlists: playlists.length,
          tracks: tracks.length,
        });
        setStorage(nextStorage);
      }
    ).catch((error) => log.error('settings storage summary failed', error));
    return () => {
      active = false;
    };
  }, []);

  const change = <Key extends keyof AppSettings>(key: Key) =>
    (value: AppSettings[Key]) => {
      setNotice('');
      void setSetting(key, value).catch((error) => {
        setNotice(key === 'audioChannelMode' && Platform.OS === 'web'
          ? 'Esta fonte externa não permite alterar os canais nesta reprodução. Use uma fonte com CORS ou áudio local.'
          : `Não foi possível aplicar a preferência: ${String(error)}`);
      });
    };

  const changeChannels = async (value: AppSettings['audioChannelMode']) => {
    if (saving || value === settings.audioChannelMode || (value === 'mono' && !capabilities.channels)) return;
    setSaving(true);
    setNotice('');
    try { await setSetting('audioChannelMode', value); }
    catch (error) {
      setNotice(Platform.OS === 'web'
        ? 'Não foi possível processar esta fonte em mono. Permita o áudio no navegador; fontes externas precisam de CORS. A preferência anterior foi mantida.'
        : String(error));
    } finally { setSaving(false); }
  };

  const clearArtworkCache = async () => {
    if (clearingImages) return;
    setClearingImages(true);
    setNotice('');
    try { await clearImageCache(); setNotice('Cache de imagens limpo.'); }
    catch (error) { setNotice(String(error)); }
    finally { setClearingImages(false); }
  };

  const showAudioDiagnostics = () => {
    const track = usePlayerStore.getState().currentTrack;
    const { sourceHost, ...output } = getAudioOutputDiagnostics();
    setDiagnosticsText(JSON.stringify(sanitizeLogData({
      app: { version: Constants.expoConfig?.version, platform: Platform.OS },
      output: { ...output, sourceHost },
      preferences: { channels: settings.audioChannelMode, streaming: settings.streamingQuality, downloads: settings.downloadQuality },
      track: track ? { id: track.spotifyId, title: track.title, durationMs: track.duration_ms } : null,
      playback: getPlayerState(),
      events: getAudioDiagnosticsSnapshot(),
    }), null, 2));
  };

  const checkForUpdates = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateStatus('Verificando…');
    const result = await checkForOTAUpdateNow();
    setCheckingUpdate(false);
    switch (result.status) {
      case 'disabled':
        setUpdateStatus('Disponível apenas no app instalado.');
        break;
      case 'window-inactive':
        setUpdateStatus('Nenhuma janela temporária de atualização do CI está ativa.');
        break;
      case 'restart-required':
        setUpdateStatus(
          `Servidor pronto até ${new Date(result.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Feche o app completamente e abra novamente.`
        );
        break;
      case 'up-to-date':
        setUpdateStatus('Você já está na versão mais recente.');
        break;
      case 'downloaded':
        setUpdateStatus(
          result.rollback
            ? 'Correção de versão pronta para o próximo início.'
            : 'Atualização pronta para o próximo início.'
        );
        break;
      case 'download-failed':
        setUpdateStatus('Atualização encontrada, mas não foi possível baixá-la.');
        break;
      case 'deferred':
        setUpdateStatus('A consulta foi adiada até o app voltar ao primeiro plano.');
        break;
      case 'not-applicable':
        setUpdateStatus(`Esta atualização não se aplica a esta versão (${result.reason}).`);
        break;
      case 'error':
        setUpdateStatus(
          `Falha na etapa ${result.stage}${result.code ? ` (${result.code})` : ''}. Consulte os logs. `
        );
        break;
    }
  };

  const showRecentLogs = () => {
    const entries = getLogBuffer();
    setDiagnosticsText(formatLogBuffer(entries.slice(0, 100)) || 'Nenhum log capturado.');
  };

  const copyLogs = async () => {
    const text = [
      'OPENFY PERFORMANCE METRICS',
      formatPerformanceMetricSummary(performanceMetrics),
      '',
      'OPENFY APP LOGS',
      formatLogBuffer(),
    ].join('\n');
    try {
      await Clipboard.setStringAsync(text || 'Nenhum log capturado.');
      setNotice(`${getLogBuffer().length} eventos copiados.`);
    } catch (error) {
      log.error('copy diagnostics failed', error);
      Alert.alert('Não foi possível copiar', 'Tente novamente.');
    }
  };

  const clearLogs = () => {
    clearLogBuffer();
    setNotice('Logs da sessão limpos.');
  };

  const resetRecommendations = () => {
    Alert.alert(
      'Redefinir recomendações?',
      'O histórico usado para montar a Home será apagado. Suas músicas e playlists permanecem intactas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Redefinir',
          style: 'destructive',
          onPress: () => void Promise.all([
            clearUserProfile(),
            clearHomeDiscoveryCache(),
          ]).then(() => {
            Alert.alert('Pronto', 'A Home começará a aprender novamente conforme você ouvir.');
          }),
        },
      ]
    );
  };

  const restoreDefaults = () => {
    Alert.alert(
      'Restaurar ajustes?',
      'As preferências do app voltarão ao padrão.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', onPress: () => void resetSettings().catch(() => setNotice('Não foi possível restaurar as preferências.')) },
      ]
    );
  };

  return (
    <SheetFrame visible={rootVisible} title="Configurações" size="full" onClose={closeSettings}
      overlay={<><OptionMenu visible={qualityPicker !== null} anchor={qualityAnchor}
        selectedValue={qualityPicker ? settings[qualityPicker] : settings.streamingQuality}
        options={qualityOptions} onClose={() => setQualityPicker(null)}
        onSelect={(quality) => { if (qualityPicker) change(qualityPicker)(quality); setQualityPicker(null); }} />
        {notice ? <GlassSurface glass="regular" style={[styles.noticePosition, { bottom: insets.bottom + 16 }]}>
          <LoggedPressable accessibilityRole="button" accessibilityLabel="Dispensar aviso"
            onPress={() => setNotice('')} style={styles.notice}>
            <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice}</Text>
            <AppIcon name="close" size={18} color="#FFFFFF" />
          </LoggedPressable>
        </GlassSurface> : null}
      </>}
      nested={<>
        <StorageManagerModal visible={storageVisible} onClose={() => setStorageVisible(false)}
          onStorageChanged={(nextStorage) => {
            setStorage(nextStorage);
            setSummary((current) => ({ ...current, downloads: nextStorage.tracks.length }));
          }} />
        <AudioSettingsSheet visible={audioVisible} onClose={() => setAudioVisible(false)} />
        <LyricsSettingsSheet visible={lyricsVisible} onClose={() => setLyricsVisible(false)} />
        <SheetFrame visible={diagnosticsText !== null} title="Diagnósticos" size="full" onClose={() => setDiagnosticsText(null)}
          headerTrailing={<NativeIconButton iconName="copy" systemImage="doc.on.doc" label="Copiar diagnósticos"
            onPress={() => void Clipboard.setStringAsync(diagnosticsText || '').then(() => setNotice('Diagnósticos copiados.')).catch(() => setNotice('Não foi possível copiar.'))} />}>
          <Text selectable style={styles.diagnosticsCode}>{diagnosticsText}</Text>
        </SheetFrame>
      </>}>
        <Section title="HOME E DESCOBERTAS">
          <SettingRow
            description="Organiza sugestões com o que você ouve e salva neste aparelho."
            icon="star-outline"
            label="Recomendações personalizadas"
            onValueChange={change('personalizedHome')}
            value={settings.personalizedHome}
          />
          <View style={styles.separator} />
          <SettingRow
            description="Inclui faixas marcadas como explícitas apenas nas recomendações."
            icon="musical-notes"
            label="Conteúdo explícito"
            onValueChange={change('allowExplicitRecommendations')}
            value={settings.allowExplicitRecommendations}
          />
        </Section>

        <Section title="REPRODUÇÃO">
          <ActionRow icon="options" label="Audio e equalizador" detail={settings.equalizerEnabled ? 'Ativo' : `${settings.playbackSpeed}x`}
            onPress={() => setAudioVisible(true)} />
          <View style={styles.separator} />
          <View style={styles.audioBlock}>
            <Text style={styles.settingLabel}>Saída de áudio</Text>
            <View pointerEvents={saving || !capabilities.channels ? 'none' : 'auto'} style={saving || !capabilities.channels ? { opacity: 0.5 } : undefined}>
              <NativeSegmented accessibilityLabel="Saída de áudio" disabled={saving || !capabilities.channels} value={settings.audioChannelMode}
                options={[{ value: 'stereo', label: 'Estéreo' }, { value: 'mono', label: 'Mono' }]}
                onChange={(mode) => void changeChannels(mode)} />
            </View>
            <Text style={styles.settingDescription}>
              {capabilities.channels ? 'Mono combina os canais esquerdo e direito. Estéreo preserva os canais da fonte.'
                : 'Instale o novo build nativo para ativar o controle de canais.'}
            </Text>
          </View>
          <View style={styles.separator} />
          <View ref={streamingRow} collapsable={false}>
            <SettingsRow title="Streaming" accessibilityLabel="Qualidade do streaming" leading={<SettingIcon name="musical-notes" />}
              disabled={!capabilities.quality} onPress={() => openQualityMenu('streamingQuality')}
              select={{ value: settings.streamingQuality, options: qualityOptions,
                onSelect: (value) => change('streamingQuality')(value as AppSettings['streamingQuality']) }} />
          </View>
          <Text style={styles.statusText}>Vale para as próximas músicas. Arquivos baixados mantêm sua qualidade.</Text>
          <View style={styles.separator} />
          <SettingRow
            description="Prepara as músicas vizinhas da fila para trocas mais rápidas."
            icon="play-skip-forward"
            label="Pré-carregar próxima música"
            onValueChange={change('preloadNextTrack')}
            value={settings.preloadNextTrack}
          />
        </Section>

        <Section title="APARÊNCIA">
          <SettingRow icon="options" label="Reduzir animacoes"
            value={settings.reduceAnimations} onValueChange={change('reduceAnimations')} />
          <View style={styles.separator} />
          <SettingRow icon="eye" label="Reduzir blur dinamico"
            value={settings.reduceDynamicBlur} onValueChange={change('reduceDynamicBlur')} />
          <View style={styles.separator} />
          <SettingRow icon="palette" label="Fundo com a capa no player"
            value={settings.artworkBackdrop} onValueChange={change('artworkBackdrop')} />
          <View style={styles.separator} />
          <ActionRow icon="chatbubble-ellipses-outline" label="Letras e provedores" onPress={() => setLyricsVisible(true)} />
          <View style={styles.separator} />
          <SettingRow icon="eye" label="Blur nas letras inativas"
            description="Mantém em foco a frase que está tocando."
            value={settings.blurInactiveLyrics} onValueChange={change('blurInactiveLyrics')} />
        </Section>

        <Section title="DOWNLOADS">
          <View ref={downloadRow} collapsable={false}>
            <SettingsRow title="Qualidade" accessibilityLabel="Qualidade dos downloads" leading={<SettingIcon name="download" />}
              disabled={!capabilities.quality} onPress={() => openQualityMenu('downloadQuality')}
              select={{ value: settings.downloadQuality, options: qualityOptions,
                onSelect: (value) => change('downloadQuality')(value as AppSettings['downloadQuality']) }} />
          </View>
          <View style={styles.separator} />
          <SettingRow
            description="Avisa quando um lote termina, inclusive em segundo plano."
            icon="notifications-outline"
            label="Notificações de conclusão"
            onValueChange={change('downloadNotifications')}
            value={settings.downloadNotifications}
          />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>{summary.downloads} baixadas</Text>
            <Text style={styles.summaryDot}>•</Text>
            <Text style={styles.summaryText}>{summary.tracks} na biblioteca</Text>
            <Text style={styles.summaryDot}>•</Text>
            <Text style={styles.summaryText}>{summary.playlists} playlists</Text>
          </View>
          <View style={styles.separator} />
          <ActionRow
            detail={formatStorageSize(storage.totalBytes)}
            icon="folder-outline"
            label="Gerenciar armazenamento"
            onPress={() => setStorageVisible(true)}
          />
          <Text selectable numberOfLines={2} style={styles.storagePath}>
            {storage.directory || 'Armazenamento interno do app'}
          </Text>
          {Platform.OS !== 'web' ? <>
            <View style={styles.separator} />
            <ActionRow icon="trash" label="Limpar cache de imagens" disabled={clearingImages}
              detail={clearingImages ? 'Aguarde' : undefined} onPress={() => void clearArtworkCache()} />
          </> : null}
        </Section>

        <Section title="ATUALIZAÇÕES">
          <SettingRow
            description="Detecta a janela temporária publicada pelo CI e avisa quando for preciso reabrir o app."
            icon="download"
            label="Avisos de atualizacao do CI"
            onValueChange={change('automaticUpdates')}
            value={settings.automaticUpdates}
          />
          <View style={styles.separator} />
          <ActionRow
            detail={checkingUpdate ? 'Aguarde' : undefined}
            icon="download"
            label="Buscar atualização agora"
            onPress={() => void checkForUpdates()}
          />
          {updateStatus ? <Text style={styles.statusText}>{updateStatus}</Text> : null}
        </Section>

        <Section title="PRIVACIDADE E DADOS">
          <View style={styles.privacyRow}>
            <AppIcon color="#1DB954" name="checkmark-circle" size={21} />
            <Text style={styles.privacyText}>
              Seu perfil de escuta e suas preferências ficam armazenados neste aparelho.
            </Text>
          </View>
          <View style={styles.separator} />
          <ActionRow
            destructive
            icon="trash"
            label="Redefinir histórico de recomendações"
            onPress={resetRecommendations}
          />
        </Section>

        <Section title="DIAGNÓSTICOS">
          <SettingRow icon="code-slash" label="Ferramentas de desenvolvimento"
            description="Logs, tempos de carregamento e estado do motor de áudio."
            value={developerVisible} onValueChange={change('developerTools')} />
          {developerVisible ? <>
          <SettingRow
            description="Guarda todos os eventos desta sessão, apenas neste aparelho."
            icon="document-text"
            label="Capturar logs"
            onValueChange={change('captureLogs')}
            value={settings.captureLogs}
          />
          <View style={styles.separator} />
          <SettingRow
            description="Inclui eventos de digitação e rolagem."
            icon="options"
            label="Logs detalhados"
            onValueChange={change('verboseLogs')}
            value={settings.verboseLogs}
          />
          <View style={styles.separator} />
          <View style={styles.metricsBlock}>
            <Text style={styles.metricsTitle}>
              Métricas recentes · {performanceMetrics.reduce((total, item) => total + item.count, 0)} medições
            </Text>
            {performanceMetrics.length ? performanceMetrics.slice(0, 6).map((metric) => (
              <View key={`${metric.category}:${metric.action}`} style={styles.metricRow}>
                <Text numberOfLines={1} style={styles.metricAction}>
                  {metric.category} · {metric.action}
                </Text>
                <Text style={styles.metricValue}>
                  n={metric.count} · média {metric.averageMs} ms · p50 {metric.p50Ms} ms · máx {metric.maxMs} ms · falhas {metric.failures}
                </Text>
              </View>
            )) : (
              <Text style={styles.metricValue}>
                Ative Capturar logs para registrar tempos nesta sessão.
              </Text>
            )}
          </View>
          <View style={styles.separator} />
          <ActionRow
            icon="pulse" label="Inspecionar reprodução" onPress={showAudioDiagnostics} />
          <View style={styles.separator} />
          <ActionRow
            detail={`${getLogBuffer().length} eventos`}
            icon="eye"
            label="Ver logs recentes"
            onPress={showRecentLogs}
          />
          <View style={styles.separator} />
          <ActionRow
            icon="copy"
            label="Copiar todos os logs"
            onPress={() => void copyLogs()}
          />
          <View style={styles.separator} />
          <ActionRow
            destructive
            icon="trash"
            label="Limpar logs"
            onPress={clearLogs}
          />
          </> : null}
        </Section>

        <Section title="SOBRE">
          <View style={styles.aboutRow}>
            <Text style={styles.actionLabel}>Openfy</Text>
            <Text style={styles.actionDetail}>
              {Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
          <View style={styles.separator} />
          <ActionRow
            icon="logo-github" label="GitHub do Openfy" detail="ompo-dev/openfy"
            onPress={() => void Linking.openURL(GITHUB_URL).catch(() => setNotice('Não foi possível abrir o GitHub.'))} />
          <View style={styles.separator} />
          <ActionRow
            icon="repeat"
            label="Restaurar preferências padrão"
            onPress={restoreDefaults}
          />
        </Section>
    </SheetFrame>
  );
};

const styles = StyleSheet.create({
  actionTrailing: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150 },
  detailText: { flexShrink: 1, textAlign: 'right' },
  settingIcon: { width: 26, alignItems: 'center', justifyContent: 'center' },
  separator: { backgroundColor: 'rgba(255,255,255,0.09)', height: StyleSheet.hairlineWidth, marginLeft: 16 },
  audioBlock: { padding: 16, gap: 12 },
  settingLabel: { color: '#F2F2F2', fontSize: 16, fontFamily: 'SF-Regular', letterSpacing: 0 },
  settingDescription: { color: '#C8C8C8', fontSize: 13, lineHeight: 18, fontFamily: 'SF-Regular' },
  statusText: { color: '#C8C8C8', fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 12 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  summaryText: { color: '#C8C8C8', fontFamily: 'SF-Regular', fontSize: 13 },
  summaryDot: { color: '#9E9E9E', fontSize: 13 },
  storagePath: { color: '#9E9E9E', fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingBottom: 12 },
  metricsBlock: { gap: 8, padding: 16 },
  metricsTitle: { color: '#F2F2F2', fontFamily: 'SF-Semibold', fontSize: 14 },
  metricRow: { gap: 4, paddingTop: 4 },
  metricAction: { color: '#C8C8C8', fontFamily: 'SF-Semibold', fontSize: 12 },
  metricValue: { color: '#9E9E9E', fontFamily: 'SF-Regular', fontSize: 11, lineHeight: 16 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  privacyText: { flex: 1, color: '#C8C8C8', fontSize: 15, lineHeight: 21, fontFamily: 'SF-Regular' },
  aboutRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16 },
  actionLabel: { flex: 1, minWidth: 0, color: '#F2F2F2', fontFamily: 'SF-Regular', fontSize: 18 },
  actionDetail: { color: '#C8C8C8', maxWidth: '40%', flexShrink: 1, textAlign: 'right', fontSize: 15 },
  noticePosition: { position: 'absolute', left: 16, right: 16, borderRadius: 18, zIndex: 40 },
  notice: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  noticeText: { flex: 1, color: '#F2F2F2', fontSize: 13, lineHeight: 19 },
  diagnosticsCode: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#D6E6E1', fontSize: 12, lineHeight: 19 },
});
