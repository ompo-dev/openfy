const labels: Record<string, string> = { 'common.close': 'Fechar', 'settings.done': 'Salvar' };
export const t = (key: string) => labels[key] ?? key;
