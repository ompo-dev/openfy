import { create } from 'zustand';

export type ConnectivityStatus = 'unknown' | 'online' | 'offline';

type ConnectivityState = {
  status: ConnectivityStatus;
  isOnline: boolean;
  offlineToastVersion: number;
  updateConnectivity: (isOnline: boolean) => void;
  showOfflineToast: () => void;
};

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  status: 'unknown',
  isOnline: true,
  offlineToastVersion: 0,
  updateConnectivity: (isOnline) =>
    set({ status: isOnline ? 'online' : 'offline', isOnline }),
  showOfflineToast: () =>
    set((state) => ({ offlineToastVersion: state.offlineToastVersion + 1 })),
}));
