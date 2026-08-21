import * as React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  GlassSurface,
  IOS_NATIVE_ENABLED,
  LoggedPressable,
  SwiftButton,
  SwiftHost,
  SwiftMenu,
  SwiftText,
  swiftButtonStyle,
  swiftFont,
  swiftForegroundStyle,
} from '../../native';

type MusicTimelineSelectorProps = {
  totalDurationMs: number;
  startTimeMs: number;
  selectionDurationMs?: number;
  windowDurationMs?: number;
  onWindowDurationChange?: (durationMs: number) => void;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
};

export function MusicTimelineSelector({
  totalDurationMs,
  startTimeMs,
  selectionDurationMs = 30000,
  windowDurationMs = selectionDurationMs,
  onWindowDurationChange,
  isPlaying,
  onTogglePlayPause,
}: MusicTimelineSelectorProps) {
  const safeDurationMs = Math.max(1, totalDurationMs);
  const left = Math.max(0, Math.min(100, (startTimeMs / safeDurationMs) * 100));
  const width = Math.max(
    0,
    Math.min(100 - left, (selectionDurationMs / safeDurationMs) * 100)
  );

  return (
    <View style={styles.timelineRow}>
      <TimelineWindowPicker
        durationMs={windowDurationMs}
        onChange={onWindowDurationChange}
      />
      <View style={styles.progressLineContainer}>
        <View style={styles.progressLineBg}>
          <View
            style={[
              styles.activeSegment,
              { left: `${left}%`, width: `${width}%` },
            ]}
          />
        </View>
      </View>
      <TouchableOpacity
        accessibilityLabel={isPlaying ? 'Pausar' : 'Tocar'}
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {}
          );
          onTogglePlayPause();
        }}
        style={styles.playButton}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={18}
          color="#000000"
          style={!isPlaying ? { marginLeft: 2 } : undefined}
        />
      </TouchableOpacity>
    </View>
  );
}

const WINDOW_OPTIONS = [15000, 30000, 45000, 60000] as const;

function TimelineWindowPicker({
  durationMs,
  onChange,
}: {
  durationMs: number;
  onChange?: (durationMs: number) => void;
}) {
  const [fallbackMenuVisible, setFallbackMenuVisible] = React.useState(false);
  const label = `${Math.round(durationMs / 1000)}`;

  if (!onChange) {
    return (
      <View style={styles.durationBadge}>
        <Text style={styles.durationBadgeText}>{label}</Text>
      </View>
    );
  }

  if (IOS_NATIVE_ENABLED) {
    return (
      <View style={styles.durationBadge}>
        <SwiftHost
          matchContents={{ horizontal: true, vertical: true }}
          style={styles.durationMenuHost}
        >
          <SwiftMenu
            label={
              <SwiftText
                modifiers={[
                  swiftForegroundStyle?.('#FFFFFF'),
                  swiftFont?.({ size: 11, weight: 'bold' }),
                ].filter(Boolean)}
              >
                {label}
              </SwiftText>
            }
            modifiers={[swiftButtonStyle?.('plain')].filter(Boolean)}
          >
            {WINDOW_OPTIONS.map((option) => (
              <SwiftButton
                key={option}
                label={`${option / 1000} segundos`}
                onPress={() => onChange(option)}
              />
            ))}
          </SwiftMenu>
        </SwiftHost>
      </View>
    );
  }

  return (
    <>
      <LoggedPressable
        accessibilityLabel="Alterar janela do waveform"
        accessibilityRole="button"
        onPress={() => setFallbackMenuVisible(true)}
        style={styles.durationBadge}
      >
        <Text style={styles.durationBadgeText}>{label}</Text>
      </LoggedPressable>
      <Modal
        transparent
        visible={fallbackMenuVisible}
        animationType="fade"
        onRequestClose={() => setFallbackMenuVisible(false)}
      >
        <View style={styles.menuOverlay}>
          <LoggedPressable
            accessibilityLabel="Fechar seleção"
            onPress={() => setFallbackMenuVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <GlassSurface glass="regular" style={styles.optionMenu}>
            {WINDOW_OPTIONS.map((option) => (
              <LoggedPressable
                key={option}
                accessibilityLabel={`${option / 1000} segundos`}
                accessibilityState={{ selected: option === durationMs }}
                onPress={() => {
                  onChange(option);
                  setFallbackMenuVisible(false);
                }}
                style={styles.optionRow}
              >
                <Text style={styles.optionText}>{option / 1000} segundos</Text>
                {option === durationMs ? (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                ) : null}
              </LoggedPressable>
            ))}
          </GlassSurface>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  durationBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
  },
  durationMenuHost: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLineContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  progressLineBg: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 1.5,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeSegment: {
    position: 'absolute',
    height: 4.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2.25,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  optionMenu: {
    borderRadius: 18,
    minWidth: 190,
    overflow: 'hidden',
    paddingVertical: 6,
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  optionText: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 15,
  },
});
