import React, { createContext, useContext, useRef, useState, type RefObject } from 'react';
import { BlurTargetView } from 'expo-blur';
import { Platform, View, type ViewProps } from 'react-native';
import { supportsAndroidGlassBlur } from './glassMaterial';

type Target = RefObject<View | null>;
const TargetContext = createContext<Target | null>(null);
const RegistrationContext = createContext<React.Dispatch<React.SetStateAction<Target | null>> | null>(null);
const canCapture = () => supportsAndroidGlassBlur(Platform.OS, Platform.Version);

export const useGlassBackdrop = () => useContext(TargetContext);
export const useRegisterGlassBackdrop = () => useContext(RegistrationContext);

/** Shares the focused page capture with the floating navigation and mini player. */
export function GlassBackdropProvider({ children }: React.PropsWithChildren) {
  const [target, setTarget] = useState<Target | null>(null);
  return (
    <RegistrationContext.Provider value={setTarget}>
      <TargetContext.Provider value={target}>{children}</TargetContext.Provider>
    </RegistrationContext.Provider>
  );
}

/** A modal or hero samples its own background, never a different native window. */
export function GlassBackdropScope({ children }: React.PropsWithChildren) {
  const target = useRef<View | null>(null);
  return <TargetContext.Provider value={canCapture() ? target : null}>{children}</TargetContext.Provider>;
}

export function GlassBackdrop({ children, targetRef, ...props }: ViewProps & { targetRef?: Target }) {
  const inheritedTarget = useGlassBackdrop();
  const target = targetRef ?? inheritedTarget;
  if (!canCapture() || !target) return <View {...props}>{children}</View>;
  return (
    <BlurTargetView {...props} ref={target} collapsable={false}>
      {/* A BlurTarget cannot contain a BlurView sampling that same target. */}
      <TargetContext.Provider value={null}>{children}</TargetContext.Provider>
    </BlurTargetView>
  );
}

export function WithoutGlassBackdrop({ children }: React.PropsWithChildren) {
  return <TargetContext.Provider value={null}>{children}</TargetContext.Provider>;
}
