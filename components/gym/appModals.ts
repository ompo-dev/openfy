export type AppModalAnchor = { x: number; y: number; width: number; height: number };
export const APP_MODAL_LABELS = {
  'settings.root': 'Configuracoes',
  'settings.audio': 'Audio e equalizador',
  'settings.lyrics': 'Letras',
  'settings.storage': 'Armazenamento',
  'settings.streamingQuality': 'Qualidade do streaming',
  'settings.downloadQuality': 'Qualidade dos downloads',
  'settings.diagnostics': 'Diagnosticos',
} as const;
export type AppModalId = keyof typeof APP_MODAL_LABELS;
export type AppModal = { id: AppModalId };
