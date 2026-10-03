import { Alert } from 'react-native';
import { useConnectivityStore } from '../../stores/useConnectivityStore';

export const showOfflineActionMessage = () => {
  useConnectivityStore.getState().showOfflineToast();
  Alert.alert(
    'Você está offline',
    'Não é possível baixar ou transmitir músicas agora. Você ainda pode ouvir as músicas já baixadas.'
  );
};
