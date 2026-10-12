import { useCallback } from 'react';
import { Keyboard } from 'react-native';
import { useAppModalStore } from '../../vendor/gym-notes/src/store/useAppModalStore';
import type { AppModalId } from './appModals';

export function openSettingsModal() {
  Keyboard.dismiss();
  const store = useAppModalStore.getState();
  if (!store.stack.some((modal) => modal.id === 'settings.root')) store.openAppModal({ id: 'settings.root' });
}

export function useSettingsModal(id: AppModalId): [boolean, (visible: boolean) => void] {
  const visible = useAppModalStore((state) => state.stack.some((modal) => modal.id === id));
  const setVisible = useCallback((open: boolean) => {
    const store = useAppModalStore.getState();
    if (open && !store.stack.some((modal) => modal.id === id)) store.openAppModal({ id });
    else if (!open) store.closeAppModal(id);
  }, [id]);
  return [visible, setVisible];
}
