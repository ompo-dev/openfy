import * as React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useAppSettings } from '@context';
import { checkForOTAUpdateNow } from '@hooks';
import {
  clearUserProfile,
  clearHomeDiscoveryCache,
  getLibraryTracks,
  getLocalPlaylists,
  type AppSettings,
} from '@services';
import { AppIcon, LoggedPressable, NativeIconButton } from '../native';

type LibrarySummary = {
  downloads: number;
  playlists: number;
  tracks: number;
};

const EMPTY_SUMMARY: LibrarySummary = { downloads: 0, playlists: 0, tracks: 0 };

const SettingRow = ({
  description,
  icon,
  label,
  onValueChange,
  value,
}: {
  description: string;
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) => (
  <View style={styles.settingRow}>
    <View style={styles.settingIcon}>
      <AppIcon color="#D8D8DC" name={icon} size={19} />
    </View>
    <View style={styles.settingCopy}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingDescription}>{description}</Text>
    </View>
    <Switch
      accessibilityLabel={label}
      onValueChange={onValueChange}
      thumbColor="#FFFFFF"
      trackColor={{ false: '#48484A', true: '#1DB954' }}
      value={value}
    />
  </View>
);

const ActionRow = ({
  detail,
  destructive = false,
  icon,
  label,
  onPress,
}: {
  detail?: string;
  destructive?: boolean;
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  onPress: () => void;
}) => (
  <LoggedPressable
    accessibilityLabel={label}
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
  >
    <View style={[styles.settingIcon, destructive && styles.destructiveIcon]}>
      <AppIcon
        color={destructive ? '#FF6B6B' : '#D8D8DC'}
        name={icon}
        size={19}
      />
    </View>
    <Text style={[styles.actionLabel, destructive && styles.destructiveText]}>
      {label}
    </Text>
    {detail ? <Text style={styles.actionDetail}>{detail}</Text> : null}
    <AppIcon color="#737378" name="chevron-forward" size={17} />
  </LoggedPressable>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

export const Settings = () => {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { settings, setSetting, resetSettings } = useAppSettings();
  const [summary, setSummary] = React.useState(EMPTY_SUMMARY);
  const [updateStatus, setUpdateStatus] = React.useState('');
  const [checkingUpdate, setCheckingUpdate] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void Promise.all([getLibraryTracks(), getLocalPlaylists()]).then(
      ([tracks, playlists]) => {
        if (!active) return;
        setSummary({
          downloads: tracks.filter((track) => track.isDownloaded).length,
          playlists: playlists.length,
          tracks: tracks.length,
        });
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const change = <Key extends keyof AppSettings>(key: Key) =>
    (value: AppSettings[Key]) => void setSetting(key, value);

  const checkForUpdates = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateStatus('Verificando…');
    const result = await checkForOTAUpdateNow();
    setCheckingUpdate(false);
    setUpdateStatus({
      disabled: 'Disponível apenas no app instalado',
      'up-to-date': 'Você já está na versão mais recente',
      downloaded: 'Atualização pronta para o próximo início',
      error: 'Não foi possível verificar agora',
    }[result]);
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
        { text: 'Restaurar', onPress: () => void resetSettings() },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: top + 8 }]}>
        <NativeIconButton
          systemImage="chevron.left"
          iconName="chevron-back"
          label="Voltar"
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>Configurações</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
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
          <SettingRow
            description="Prepara as músicas vizinhas da fila para trocas mais rápidas."
            icon="play-skip-forward"
            label="Pré-carregar próxima música"
            onValueChange={change('preloadNextTrack')}
            value={settings.preloadNextTrack}
          />
        </Section>

        <Section title="DOWNLOADS">
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
        </Section>

        <Section title="ATUALIZAÇÕES">
          <SettingRow
            description="Procura uma nova versão quando você volta ao app."
            icon="download"
            label="Verificar ao voltar ao app"
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

        <Section title="SOBRE">
          <View style={styles.aboutRow}>
            <Text style={styles.actionLabel}>Openfy</Text>
            <Text style={styles.actionDetail}>
              {Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
          <View style={styles.separator} />
          <ActionRow
            icon="repeat"
            label="Restaurar preferências padrão"
            onPress={restoreDefaults}
          />
        </Section>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#121212', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: '#121212',
    flexDirection: 'row',
    minHeight: 60,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: 'SF-Bold',
    fontSize: 20,
    textAlign: 'center',
  },
  headerSpacer: { height: 44, width: 44 },
  content: {
    gap: 24,
    paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 110,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: { gap: 8 },
  sectionTitle: {
    color: '#8E8E93',
    fontFamily: 'SF-Semibold',
    fontSize: 12,
    paddingHorizontal: 4,
  },
  sectionBody: {
    backgroundColor: '#1C1C1E',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  settingIcon: {
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 7,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  destructiveIcon: { backgroundColor: 'rgba(255,69,58,0.12)' },
  settingCopy: { flex: 1, gap: 3, minWidth: 0 },
  settingLabel: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 15 },
  settingDescription: {
    color: '#8E8E93',
    fontFamily: 'SF-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  separator: { backgroundColor: '#303033', height: StyleSheet.hairlineWidth, marginLeft: 60 },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowPressed: { opacity: 0.65 },
  actionLabel: { color: '#FFFFFF', flex: 1, fontFamily: 'SF-Semibold', fontSize: 15 },
  actionDetail: { color: '#8E8E93', fontFamily: 'SF-Regular', fontSize: 13 },
  destructiveText: { color: '#FF6B6B' },
  summaryRow: {
    alignItems: 'center',
    borderTopColor: '#303033',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryText: { color: '#A8A8AD', fontFamily: 'SF-Regular', fontSize: 12 },
  summaryDot: { color: '#5A5A5F', fontSize: 12 },
  statusText: {
    borderTopColor: '#303033',
    borderTopWidth: StyleSheet.hairlineWidth,
    color: '#A8A8AD',
    fontFamily: 'SF-Regular',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  privacyRow: { alignItems: 'center', flexDirection: 'row', gap: 11, padding: 14 },
  privacyText: { color: '#A8A8AD', flex: 1, fontFamily: 'SF-Regular', fontSize: 13, lineHeight: 18 },
  aboutRow: { alignItems: 'center', flexDirection: 'row', minHeight: 54, paddingHorizontal: 14 },
});
