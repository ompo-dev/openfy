import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassSurface, LoggedPressable } from '../native';

type PlayerActionPillProps = {
  isLiked: boolean;
  onOpenLyrics: () => void;
  onOpenOptions: () => void;
  onToggleLike: () => void;
  size?: 'full' | 'mini';
  style?: any;
};

/** Shared heart, lyrics and options control used by both player sizes. */
export const PlayerActionPill = ({
  isLiked,
  onOpenLyrics,
  onOpenOptions,
  onToggleLike,
  size = 'full',
  style,
}: PlayerActionPillProps) => {
  const mini = size === 'mini';

  return (
    <GlassSurface
      glass="regular"
      isInteractive
      style={[styles.pill, mini && styles.miniPill, style]}
    >
      <LoggedPressable
        accessibilityLabel={isLiked ? 'Remover dos favoritos' : 'Favoritar música'}
        accessibilityRole="button"
        onPress={onToggleLike}
        style={[styles.segment, mini && styles.miniSegment]}
      >
        <Ionicons
          name={isLiked ? 'heart' : 'heart-outline'}
          size={mini ? 28 : 19}
          color={isLiked ? '#FF3B30' : 'rgba(255,255,255,0.86)'}
        />
      </LoggedPressable>

      <View style={[styles.divider, mini && styles.miniDivider]} />

      <LoggedPressable
        accessibilityLabel="Abrir letras"
        accessibilityRole="button"
        onPress={onOpenLyrics}
        style={[styles.segment, mini && styles.miniSegment]}
      >
        <Ionicons
          name="musical-note"
          size={mini ? 29 : 19}
          color="rgba(255,255,255,0.86)"
        />
      </LoggedPressable>

      <View style={[styles.divider, mini && styles.miniDivider]} />

      <LoggedPressable
        accessibilityLabel="Opções da música"
        accessibilityRole="button"
        onPress={onOpenOptions}
        style={[styles.segment, mini && styles.miniSegment]}
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={mini ? 28 : 19}
          color="rgba(255,255,255,0.86)"
        />
      </LoggedPressable>
    </GlassSurface>
  );
};

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    height: 44,
    paddingHorizontal: 16,
  },
  miniPill: {
    borderRadius: 30,
    height: 60,
    paddingHorizontal: 12,
  },
  segment: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  miniSegment: {
    minWidth: 76,
    paddingHorizontal: 20,
  },
  divider: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    height: 16,
    width: 1,
  },
  miniDivider: { height: 28 },
});
