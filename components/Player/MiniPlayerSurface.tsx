import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { GlassSurfaceFallback } from '../native/GlassSurfaceFallback';

export type MiniPlayerSurfaceProps = { children: ReactNode; style?: StyleProp<ViewStyle> };

export const MiniPlayerSurface = ({ children, style }: MiniPlayerSurfaceProps) => (
  <GlassSurfaceFallback glass="regular" style={style}>{children}</GlassSurfaceFallback>
);
