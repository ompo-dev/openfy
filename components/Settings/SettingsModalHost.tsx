import { usePathname } from 'expo-router';
import { useAppModalStore } from '../gym';
import { Settings } from './Settings';

/** Present from the existing page controller, just as Gym does, without pushing a blank route first. */
export function SettingsModalHost() {
  const pathname = usePathname();
  const visible = useAppModalStore((state) => state.stack.some((modal) => modal.id === 'settings.root'));
  // Direct links retain their route-owned instance, never two native presentations.
  if (!visible || pathname.endsWith('/settings')) return null;
  return <Settings onClose={() => useAppModalStore.getState().closeAllAppModals()} />;
}
