import React, { useCallback, useRef } from 'react';
import { Platform, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { GlassBackdrop, useRegisterGlassBackdrop } from './GlassBackdrop';
import { supportsAndroidGlassBlur } from './glassMaterial';

export function GlassScreenBackdrop({ children }: React.PropsWithChildren) {
  const target = useRef<View | null>(null);
  const register = useRegisterGlassBackdrop();
  useFocusEffect(useCallback(() => {
    if (!supportsAndroidGlassBlur(Platform.OS, Platform.Version) || !register) return;
    register(target);
    return () => register((current) => current === target ? null : current);
  }, [register]));
  if (!supportsAndroidGlassBlur(Platform.OS, Platform.Version)) return <>{children}</>;
  return <GlassBackdrop targetRef={target} style={{ flex: 1 }}>{children}</GlassBackdrop>;
}
