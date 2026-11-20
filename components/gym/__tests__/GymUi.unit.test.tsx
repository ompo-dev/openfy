import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { Section, SettingsRow, TextField, Toggle, NativeSegmented, useAppModalStore } from '../index';
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
  expect(screen.getByText('Pre-carregar').props.adjustsFontSizeToFit).not.toBe(true);
});

it('centers the paste action beside the input rather than beside its label', async () => {
  const screen = await render(<TextField label="Link" trailing={<Text>Paste</Text>} />);
  const row = screen.getByTestId('gym-text-field-input-row');
  const trailing = screen.getByTestId('gym-text-field-trailing');
  expect(trailing.parent).toBe(row);
  expect(screen.getByText('Link').parent).not.toBe(row);
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ alignItems: 'center', minWidth: 0 });
  expect(StyleSheet.flatten(trailing.props.style)).toMatchObject({ alignSelf: 'center', flexShrink: 0 });
});
