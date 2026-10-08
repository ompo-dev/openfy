import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArtistModel } from '@models';
import { LoggedPressable } from '../native';
import { AppIcon } from '../native/AppIcon';
import { SkeletonImage } from '../common/SkeletonImage';

export const ArtistSearchRow = ({ artist, onPress, trailingAction }: {
  artist: ArtistModel;
  onPress: () => void;
  trailingAction?: React.ReactNode;
}) => (
  <LoggedPressable accessibilityLabel={`Abrir artista ${artist.name}`} onPress={onPress} style={styles.row}>
    {artist.imageURL ? (
      <SkeletonImage cachePolicy="memory-disk" priority="high" source={{ uri: artist.imageURL }}
        contentFit="cover" style={styles.image} />
    ) : (
      <View style={[styles.image, styles.fallback]}><AppIcon name="person" size={22} color="#8E8E93" /></View>
    )}
    <View style={styles.copy}>
      <Text numberOfLines={1} style={styles.title}>{artist.name}</Text>
      <Text numberOfLines={1} style={styles.subtitle}>{artist.genres?.slice(0, 2).join(' · ') || 'Artista'}</Text>
    </View>
    {trailingAction || <AppIcon name="chevron-forward" size={18} color="#85858A" />}
  </LoggedPressable>
);

const styles = StyleSheet.create({
  row: { minHeight: 64, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  image: { width: 42, height: 42, borderRadius: 21 },
  fallback: { backgroundColor: '#242428', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: '#FFFFFF', fontSize: 14, fontFamily: 'SF-Semibold' },
  subtitle: { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontFamily: 'SF-Regular' },
});
