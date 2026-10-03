import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type SyncedLyricTextProps = {
  children: string;
  active: boolean;
  blurred: boolean;
};

export const SyncedLyricText = React.memo(function SyncedLyricText({
  children, active, blurred,
}: SyncedLyricTextProps) {
  return (
    <View style={[styles.container, blurred && styles.blurred]}>
      <Text style={[styles.text, active && styles.active]}>{children}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%' },
  blurred: { filter: 'blur(3px)' },
  text: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: 0,
    textAlign: 'left',
    width: '100%',
  },
  active: { color: '#FFFFFF' },
});
