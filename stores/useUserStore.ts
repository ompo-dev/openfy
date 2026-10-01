import { create } from 'zustand';

import { getUser } from '../api/user';
import type { UserModel } from '../models/User/UserModel';
import { log } from '../utils/appLogger';

const EMPTY_USER: UserModel = {
  id: '',
  type: 'user',
  displayName: '',
  imageURL: '',
};

type UserState = {
  userData: UserModel;
  isReady: boolean;
  loadUser: () => Promise<void>;
};

let userLoad: Promise<void> | null = null;

export const useUserStore = create<UserState>((set, get) => ({
  userData: EMPTY_USER,
  isReady: false,
  loadUser: () => {
    if (get().isReady) return Promise.resolve();
    if (userLoad) return userLoad;
    const finish = log.time('network', 'user profile load');
    userLoad = getUser()
      .then((userData) => {
        set({ userData, isReady: true });
        finish({ ok: true, hasUser: Boolean(userData.id) });
      })
      .catch((error: unknown) => {
        finish({ ok: false, error: String(error) });
        log.error('user profile load failed', error);
      })
      .finally(() => {
        userLoad = null;
      });
    return userLoad;
  },
}));

export const initializeUserStore = () => useUserStore.getState().loadUser();
