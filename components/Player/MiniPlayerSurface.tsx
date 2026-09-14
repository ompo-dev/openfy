import type { ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import { GlassSurfaceFallback } from '../native/GlassSurfaceFallback';

export type MiniPlayerSurfaceProps = ViewProps & { children: ReactNode; style?: StyleProp<ViewStyle> };

export const MiniPlayerSurface = ({ children, style, ...rest }: MiniPlayerSurfaceProps) => (
  <GlassSurfaceFallback glass="regular" style={style} {...rest}>{children}</GlassSurfaceFallback>
);
