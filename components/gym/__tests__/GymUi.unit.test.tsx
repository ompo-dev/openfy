import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { Section, SettingsRow, Toggle, NativeSegmented, useAppModalStore } from '../index';
import { SheetFrame } from '../../native/SheetFrame';
import { useSettingsModal } from '../useSettingsModal';

jest.mock('@/components/onboarding/onboardingNative', () => jest.requireActual('@/components/onboarding/onboardingNative.ts'));

afterEach(() => useAppModalStore.getState().closeAllAppModals());

it('uses the copied Gym modal stack, preserving the parent until the top child closes', () => {
  const store = useAppModalStore.getState();
  store.openAppModal({ id: 'settings.root' });
  store.openAppModal({ id: 'settings.audio' });
  store.openAppModal({ id: 'settings.lyrics' });
  store.closeAppModal('settings.audio');
  expect(useAppModalStore.getState().stack.map((modal) => modal.id)).toEqual([
    'settings.root', 'settings.audio', 'settings.lyrics',
  ]);
  store.closeAppModal('settings.lyrics');
  expect(useAppModalStore.getState().stack.at(-1)?.id).toBe('settings.audio');
  store.closeAppModal('settings.audio');
  expect(useAppModalStore.getState().stack.at(-1)?.id).toBe('settings.root');
});

it('keeps nested sheets inside the parent modal and prevents repeated opening of a child', async () => {
  function Example() {
    const [visible, setVisible] = useSettingsModal('settings.audio');
    return <SheetFrame visible title="Configuracoes" size="full" onClose={() => {}}
      nested={<SheetFrame visible={visible} title="Audio" size="full" onClose={() => setVisible(false)}>
        <Text>Velocidade</Text>
      </SheetFrame>}>
      <Section label="Reproducao"><SettingsRow title="Abrir audio" onPress={() => setVisible(true)} /></Section>
    </SheetFrame>;
  }
  const screen = await render(<Example />);
  await fireEvent.press(screen.getByLabelText('Abrir audio'));
  const modals = screen.getAllByTestId('gym-sheet-modal');
  expect(modals).toHaveLength(2);
  expect(modals.every((modal) => modal.props.presentationStyle === 'pageSheet' && modal.props.allowSwipeDismissal)).toBe(true);
  let parent = modals[1].parent;
  while (parent && parent !== modals[0]) parent = parent.parent;
  expect(parent).toBe(modals[0]);
  await act(() => useAppModalStore.getState().closeAppModal('settings.audio'));
  expect(screen.getAllByTestId('gym-sheet-modal')).toHaveLength(1);
});

it('retains native switches, functional segmented selections and Gym row dimensions', async () => {
  const toggle = jest.fn();
  const selection = jest.fn();
  const screen = await render(<Section label="Reproducao">
    <SettingsRow title="Pre-carregar" trailing={<Toggle label="Pre-carregar" value onValueChange={toggle} />} />
    <NativeSegmented value="stereo" options={[{ value: 'stereo', label: 'Estereo' }, { value: 'mono', label: 'Mono' }]}
      onChange={selection} />
  </Section>);
  await fireEvent(screen.getByLabelText('Pre-carregar'), 'valueChange', false);
  expect(toggle).toHaveBeenCalledWith(false);
  await fireEvent.press(screen.getByLabelText('Mono'));
  expect(selection).toHaveBeenCalledWith('mono');
  expect(StyleSheet.flatten(screen.getByText('Pre-carregar').props.style)).toMatchObject({ fontSize: 16, letterSpacing: 0 });
  expect(screen.getByText('Pre-carregar').props.numberOfLines).toBe(1);
});
