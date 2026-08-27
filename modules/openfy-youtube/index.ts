// Re-export the native module. On web, it will be resolved to OpenfyYouTubeModule.web.ts
// and on native platforms to OpenfyYouTubeModule.ts
export { default } from './src/OpenfyYouTubeModule';
export * from './src/OpenfyYouTube.types';
