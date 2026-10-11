import * as React from 'react';
import { ActivityIndicator, Animated, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../native/AppIcon';
import { GlassSurface } from '../native/GlassSurface';
import { LoggedPressable } from '../native/Logged';
import type { AppUpdatePhase } from '../../hooks/useOTAStartupUpdate';

const copy = {
  checking: ['Verificando atualiza\u00e7\u00e3o', 'Buscando a vers\u00e3o mais recente do Openfy.'],
  downloading: ['Baixando atualiza\u00e7\u00e3o', 'Preparando as novidades para voc\u00ea.'],
  applying: ['Aplicando atualiza\u00e7\u00e3o', 'O Openfy vai abrir novamente em instantes.'],
  error: ['N\u00e3o foi poss\u00edvel atualizar', 'Sua vers\u00e3o instalada continua dispon\u00edvel.'],
} as const;

export function AppUpdateScreen({ phase, progress, onContinue, onRetry }: {
  phase: AppUpdatePhase;
  progress?: number;
  onContinue?: () => void;
  onRetry?: () => void;
}) {
  const amount = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress)) : undefined;
  const animatedProgress = React.useRef(new Animated.Value(amount ?? 0)).current;
  React.useEffect(() => {
    const animation = Animated.timing(animatedProgress, {
      toValue: phase === 'applying' ? 1 : amount ?? 0,
      duration: 220,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [amount, phase, animatedProgress]);

  if (phase === 'idle') return null;
  const [title, subtitle] = copy[phase];
  const determinate = phase === 'applying' || (phase === 'downloading' && amount !== undefined);
  const percentage = amount === undefined ? undefined : Math.round(amount * 100);

  return (
    <SafeAreaView style={styles.screen} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <Image source={require('../../assets/images/app-icon/openfy-android-foreground.png')}
          style={styles.mark} resizeMode="contain" accessibilityLabel="Openfy" />
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.progressArea}>
          {determinate ? (
            <View style={styles.track} accessible accessibilityRole="progressbar"
              accessibilityLabel={'Progresso da atualiza\u00e7\u00e3o'}
              accessibilityValue={{ min: 0, max: 100, now: phase === 'applying' ? 100 : percentage }}>
              <Animated.View style={[styles.fill, { width: animatedProgress.interpolate({
                inputRange: [0, 1], outputRange: ['0%', '100%'],
              }) }]} />
            </View>
          ) : phase === 'error' ? (
            <AppIcon name="cloud-offline-outline" size={28} color="#B7BAC0" />
          ) : <ActivityIndicator color="#1ED760" size="small" accessibilityLabel={title} />}
          {phase === 'downloading' && percentage !== undefined
            ? <Text style={styles.percentage}>{percentage}%</Text> : null}
        </View>
        <View style={styles.actions}>
          {phase === 'error' && onRetry ? (
            <LoggedPressable onPress={onRetry} accessibilityRole="button"
              accessibilityLabel="Tentar novamente">
              <GlassSurface glass="regular" isInteractive style={styles.retry}>
                <AppIcon name="refresh" size={20} />
                <Text style={styles.actionText}>Tentar novamente</Text>
              </GlassSurface>
            </LoggedPressable>
          ) : null}
          {phase !== 'applying' && onContinue ? (
            <LoggedPressable onPress={onContinue} accessibilityRole="button"
              accessibilityLabel="Continuar no app" style={styles.continue}>
              <Text style={styles.continueText}>Continuar no app</Text>
              <AppIcon name="chevron-forward" size={18} color="#B7BAC0" />
            </LoggedPressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: '#121212', zIndex: 1000 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 28 },
  mark: { width: 120, height: 120 },
  status: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 10 },
  title: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 22, textAlign: 'center' },
  subtitle: { color: '#B7BAC0', fontFamily: 'SF-Regular', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  progressArea: { width: '100%', maxWidth: 280, minHeight: 44, alignItems: 'center', gap: 12 },
  track: { width: '100%', height: 5, backgroundColor: '#34363A', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#1ED760', borderRadius: 3 },
  percentage: { color: '#B7BAC0', fontSize: 14, fontVariant: ['tabular-nums'] },
  actions: { alignItems: 'center', gap: 12, minHeight: 100, maxWidth: '100%' },
  retry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28 },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  continue: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  continueText: { color: '#B7BAC0', fontSize: 15, flexShrink: 1 },
});
