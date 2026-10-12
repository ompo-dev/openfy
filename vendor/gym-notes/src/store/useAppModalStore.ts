import { create } from 'zustand';

import { APP_MODAL_LABELS, type AppModal, type AppModalId } from '@/core/appModals';
import { log } from '@/core/log';

interface AppModalState {
  stack: AppModal[];
  openAppModal: (modal: AppModal) => void;
  replaceAppModal: (modal: AppModal) => void;
  closeAppModal: (id?: AppModalId) => void;
  closeAllAppModals: () => void;
}

/** Every sheet, menu and picker is a modal on this stack, so one log here is
 *  the whole navigation trail: what opened, what it replaced, where it went
 *  back to. `id` names it; `APP_MODAL_LABELS` gives the human name. */
function trail(action: string, modal: AppModal | undefined, from: AppModal | undefined): void {
  const name = modal ? APP_MODAL_LABELS[modal.id] : '—';
  log.nav(`${action} ${modal?.id ?? ''}`, {
    label: name,
    from: from?.id ?? null,
    ...(modal && 'ownerId' in modal ? { ownerId: modal.ownerId } : {}),
    ...(modal && 'mode' in modal ? { mode: modal.mode } : {}),
    ...(modal && 'kind' in modal ? { kind: modal.kind } : {}),
  });
}

export const useAppModalStore = create<AppModalState>((set) => ({
  stack: [],

  openAppModal: (modal) =>
    set((state) => {
      trail('open', modal, state.stack.at(-1));
      return { stack: [...state.stack, modal] };
    }),

  replaceAppModal: (modal) =>
    set((state) => {
      trail('replace →', modal, state.stack.at(-1));
      return { stack: state.stack.length ? [...state.stack.slice(0, -1), modal] : [modal] };
    }),

  closeAppModal: (id) =>
    set((state) => {
      const active = state.stack.at(-1);
      if (!active || (id && active.id !== id)) return state;
      trail('close ← back to', state.stack.at(-2), active);
      return { stack: state.stack.slice(0, -1) };
    }),

  closeAllAppModals: () =>
    set((state) => {
      if (state.stack.length) log.nav('closeAll', { closed: state.stack.map((m) => m.id) });
      return { stack: [] };
    }),
}));
