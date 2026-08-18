// Non-iOS surface (Android, web). iOS resolves `GlassSurface.ios.tsx` instead,
// which is the only place `expo-glass-effect` is imported. Keeping this file
// free of that native import is the whole point of the split.
export { GlassSurfaceFallback as GlassSurface } from './GlassSurfaceFallback';
export type { GlassSurfaceProps, GlassKind } from './GlassSurfaceFallback';
