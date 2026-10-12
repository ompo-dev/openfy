import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { usePlayer } from '@context';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { GlassSurface } from '../native/GlassSurface';

/** One material for the player and all fitted sheets, without a window-wide dimmer. */
export function PlayerSheetBackground({ artworkURL, artworkEnabled = true, children }:
  React.PropsWithChildren<{ artworkURL?: string; artworkEnabled?: boolean }>) {
  const { currentTrack } = usePlayer((state) => ({ currentTrack: state.currentTrack }));
  const reduceBlur = useAppSettingsStore((state) => state.settings.reduceDynamicBlur);
  const showArtwork = artworkEnabled && !reduceBlur;
  const currentArtwork = currentTrack?.localImagePath || currentTrack?.imageURL;
  const uri = showArtwork ? artworkURL || currentArtwork : undefined;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.base]}>
    {showArtwork ? children || (uri ? <Image testID="sheet-artwork-background" source={{ uri }} cachePolicy="memory-disk" contentFit="cover"
      blurRadius={28} style={[StyleSheet.absoluteFill, styles.artwork]} /> : null) : null}
    <GlassSurface glass="regular" edgeEffects={false} style={[StyleSheet.absoluteFill, styles.tint]} />
  </View>;
}
const styles = StyleSheet.create({
  base: { backgroundColor: '#242424' },
  artwork: { opacity: 0.64, transform: [{ scale: 1.1 }] },
  tint: { backgroundColor: 'rgba(36,36,36,0.3)', borderWidth: 0 },
});
