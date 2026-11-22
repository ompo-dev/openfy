import { Alert } from 'react-native';
import { useConnectivityStore } from '../../stores/useConnectivityStore';

export const showOfflineActionMessage = (options: { alert?: boolean } = {}) => {
  useConnectivityStore.getState().showOfflineToast();
  // Playback already displays an inline toast; don't stack a modal on it.
  if (options.alert === false) return;
  Alert.alert(
    'Você está offline',
    'Não é possível baixar ou transmitir músicas agora. Você ainda pode ouvir as músicas já baixadas.'
  );
};
