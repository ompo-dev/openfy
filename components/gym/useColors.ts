import { Colors } from './theme';

// Openfy currently has a dark-only app surface, independent of the device scheme.
export const useColors = () => Colors.dark;
export const useAppColorScheme = () => 'dark' as const;
