import * as React from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDetailNavigation } from '@hooks';
import { getLibraryTracks } from '@services';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { subscribeImports, type ImportJob } from '../../services/library/libraryImports';
import { getImportDestination, type ImportDestination } from '../../services/background/importNotifications';
import { AppIcon, GlassSurface, LoggedPressable } from '../native';

export function LibraryImportFeedback() {
  const { openDetail } = useDetailNavigation();
  const insets = useSafeAreaInsets();
  const [notices, setNotices] = React.useState<ImportJob[]>([]);
  const handledResponses = React.useRef(new Set<string>());
  const opening = React.useRef(false);
  const open = React.useCallback(async (destination: ImportDestination) => {
    if (opening.current) return;
    opening.current = true;
    try {
      usePlayerStore.getState().setIsFullPlayerVisible(false);
      if (destination.kind !== 'track') {
        openDetail(destination.kind, destination.id, 'library');
      } else {
        const track = (await getLibraryTracks()).find((item) => item.spotifyId === destination.id);
        if (!track) throw new Error('Música removida da biblioteca');
        await usePlayerStore.getState().playTrack({ ...track, streamUrl: track.audioUrl });
        usePlayerStore.getState().setIsFullPlayerVisible(true);
      }
    } catch {
      Alert.alert('Biblioteca', 'Não foi possível abrir este conteúdo.');
    } finally { opening.current = false; }
  }, [openDetail]);

  React.useEffect(() => subscribeImports((job) => {
    if (job.status !== 'completed' && job.status !== 'error') return;
    setNotices((current) => [...current.filter((item) => item.key !== job.key), job]);
  }), []);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const respond = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const { request } = response.notification;
      const destination = getImportDestination(request.content.data || {});
      if (!destination || handledResponses.current.has(request.identifier)) return;
      handledResponses.current.add(request.identifier);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      void open(destination);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(respond);
    void Notifications.getLastNotificationResponseAsync().then(respond).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, [open]);

  const notice = notices[0];
  if (!notice) return null;
  const dismiss = () => setNotices((current) => current.filter((job) => job.key !== notice.key));
  return <View style={[styles.position, { bottom: 176 + insets.bottom }]}>
    <GlassSurface glass="regular" style={styles.banner}>
      <LoggedPressable accessibilityRole="button" accessibilityLabel={notice.destination ? 'Abrir conteúdo adicionado' : 'Fechar aviso de importação'}
        style={styles.content} onPress={() => {
          dismiss();
          if (notice.destination) void open(notice.destination);
        }}>
        <AppIcon name={notice.status === 'completed' ? 'checkmark-circle' : 'alert-circle'} size={22}
          color={notice.status === 'completed' ? '#1ED760' : '#FF6969'} />
        <View style={styles.copy}>
          <Text style={styles.title}>{notice.status === 'completed' ? 'Adicionado à biblioteca' : 'Não foi possível adicionar'}</Text>
          <Text numberOfLines={2} style={styles.subtitle}>{notice.status === 'completed' ? notice.title : notice.error}</Text>
        </View>
        {notice.destination ? <AppIcon name="chevron-forward" size={18} color="#FFFFFF" /> : null}
      </LoggedPressable>
      <LoggedPressable accessibilityLabel="Dispensar aviso" onPress={dismiss} style={styles.close}>
        <AppIcon name="close" size={20} color="#FFFFFF" />
      </LoggedPressable>
    </GlassSurface>
  </View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', left: 16, right: 16, zIndex: 35 },
  banner: { borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 64 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 14 },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontFamily: 'SF-Regular', fontSize: 12 },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
});
