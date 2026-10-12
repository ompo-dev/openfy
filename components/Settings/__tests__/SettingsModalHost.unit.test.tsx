/* eslint-disable @typescript-eslint/no-require-imports -- Hoisted factories render a light settings probe. */
import { act, fireEvent, render } from '@testing-library/react-native';
import { SettingsModalHost } from '../SettingsModalHost';
import { useAppModalStore } from '../../gym';
import { openSettingsModal } from '../../gym/useSettingsModal';

let mockPathname = '/library';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
jest.mock('../Settings', () => ({
  Settings: ({ onClose }: { onClose: () => void }) => require('react').createElement(require('react-native').Pressable,
    { accessibilityLabel: 'Fechar ajustes globais', onPress: onClose }),
}));
afterEach(() => { useAppModalStore.getState().closeAllAppModals(); mockPathname = '/library'; });

it('opens once over the existing route and closes without changing that route', async () => {
  const screen = await render(<SettingsModalHost />);
  expect(screen.queryByLabelText('Fechar ajustes globais')).toBeNull();
  await act(() => { openSettingsModal(); openSettingsModal(); });
  expect(useAppModalStore.getState().stack).toEqual([{ id: 'settings.root' }]);
  expect(mockPathname).toBe('/library');
  await fireEvent.press(screen.getByLabelText('Fechar ajustes globais'));
  expect(useAppModalStore.getState().stack).toEqual([]);
  expect(screen.queryByLabelText('Fechar ajustes globais')).toBeNull();
});

it('never adds a second native settings modal on the settings deep-link route', async () => {
  mockPathname = '/library/settings';
  const screen = await render(<SettingsModalHost />);
  await act(() => openSettingsModal());
  expect(screen.queryByLabelText('Fechar ajustes globais')).toBeNull();
});
