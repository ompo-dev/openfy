import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon as Ionicons } from "../native/AppIcon";
import { LoggedPressable } from '../native';
import { SkeletonImage } from '../common/SkeletonImage';

type Props = {
  label: string; role: string; name: string; imageURL: string;
  onPress: () => void; disabled?: boolean;
  trailing?: React.ReactNode; fallbackIcon?: 'person' | 'disc';
};

export function PlayerDetailCard({ label, role, name, imageURL, onPress,
  disabled, trailing, fallbackIcon = 'person' }: Props) {
  return (
    <LoggedPressable accessibilityRole="button" accessibilityLabel={label}
      disabled={disabled} onPress={onPress} style={styles.card}>
      {imageURL ? <SkeletonImage source={{ uri: imageURL }} cachePolicy="memory-disk"
        contentFit="fill" style={styles.image} /> :
        <View style={[styles.image, styles.fallback]}><Ionicons name={fallbackIcon} size={24} color="#DDD" /></View>}
      <View style={styles.copy}>
        <Text style={styles.role}>{role}</Text>
        <Text numberOfLines={2} style={styles.name}>{name}</Text>
      </View>
      {trailing || <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />}
    </LoggedPressable>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.11)', borderRadius: 16,
    flexDirection: 'row', gap: 12, minHeight: 78, padding: 12 },
  image: { borderRadius: 12, height: 54, width: 54 },
  fallback: { alignItems: 'center', backgroundColor: '#3A3A3A', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  role: { color: 'rgba(255,255,255,0.58)', fontSize: 12 },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
