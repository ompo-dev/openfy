import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { UserModel } from '../models/User/UserModel';
import { initializeUserStore, useUserStore } from '../stores/useUserStore';

export type UserDataProviderPropsType = { children: React.ReactNode };
export type UserContextType = { userData: UserModel };

export const UserDataProvider = ({ children }: UserDataProviderPropsType) => {
  React.useEffect(() => {
    void initializeUserStore();
  }, []);

  return <>{children}</>;
};

export const useUserData = (): UserContextType =>
  useUserStore(useShallow((state) => ({ userData: state.userData })));
