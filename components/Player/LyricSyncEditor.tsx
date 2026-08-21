import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MusicTimelineSelector } from '../Home/FriendActivityStatus/MusicTimelineSelector';
import { MusicWaveformReel } from '../Home/FriendActivityStatus/MusicWaveformReel';

type LyricSyncEditorProps = {
  selectedRange: { startTimeMs: number; endTimeMs: number } | null;
  totalDurationMs: number;
  currentPositionMs: number;
  onMove: (deltaMs: number) => number;
  onResizeStart: (deltaMs: number) => number;
  onResizeEnd: (deltaMs: number) => number;
  onScrubStart: () => void;
  onScrubEnd: (positionMs?: number) => void;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  waveformSeed: string;
};

const WAVEFORM_WINDOW_MS = 30000;

export function LyricSyncEditor({
  selectedRange,
  totalDurationMs,
  currentPositionMs,
  onMove,
  onResizeStart,
  onResizeEnd,
  onScrubStart,
  onScrubEnd,
  isPlaying,
  onTogglePlayPause,
  waveformSeed,
}: LyricSyncEditorProps) {
  const [viewportDurationMs, setViewportDurationMs] =
    React.useState(WAVEFORM_WINDOW_MS);

  if (!selectedRange) return null;

  const selectionDurationMs = Math.max(
    150,
    selectedRange.endTimeMs - selectedRange.startTimeMs
  );
  const timelineStartMs = Math.max(
    0,
    Math.min(
      totalDurationMs - viewportDurationMs,
      selectedRange.startTimeMs - (viewportDurationMs - selectionDurationMs) / 2
    )
  );
  const selectionProgress = Math.max(
    0,
    Math.min(
      1,
      (currentPositionMs - selectedRange.startTimeMs) / selectionDurationMs
    )
  );

  return (
    <View style={styles.container}>
      <MusicTimelineSelector
        isPlaying={isPlaying}
        onTogglePlayPause={onTogglePlayPause}
        onWindowDurationChange={setViewportDurationMs}
        selectionDurationMs={viewportDurationMs}
        startTimeMs={timelineStartMs}
        totalDurationMs={totalDurationMs}
        windowDurationMs={viewportDurationMs}
      />
      <MusicWaveformReel
        onMoveToStart={(requestedStartMs) =>
          selectedRange.startTimeMs +
          onMove(requestedStartMs - selectedRange.startTimeMs)
        }
        onResizeEnd={onResizeEnd}
        onResizeStart={onResizeStart}
        onScrubEnd={onScrubEnd}
        onScrubStart={onScrubStart}
        seed={waveformSeed}
        selectionDurationMs={selectionDurationMs}
        selectionProgress={selectionProgress}
        selectionStartMs={selectedRange.startTimeMs}
        totalDurationMs={totalDurationMs}
        viewportDurationMs={viewportDurationMs}
      />
      <Text style={styles.hint}>
        Arraste onda para mover; pontos laterais alteram intervalo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 8,
  },
  hint: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
});
