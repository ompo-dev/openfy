/* eslint-disable @typescript-eslint/no-require-imports -- Hoisted factories load mocked native components. */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { GlassSurfaceFallback } from '../GlassSurfaceFallback';
import { GlassSurface as AppleGlassSurface } from '../GlassSurface.ios';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useAppSettingsStore } from '../../../stores/useAppSettingsStore';

jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: jest.fn(() => true),
}));

const originalOS = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  useAppSettingsStore.setState((state) => ({ settings: { ...state.settings, reduceDynamicBlur: false } }));
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
});

it.each(['web', 'android', 'ios'])('keeps the copied Gym geometry and removes blur when requested on %s', async (os) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  const screen = await render(<AppleGlassSurface testID="material" style={{ borderRadius: 22, padding: 12 }}>
    <Text>Control</Text>
  </AppleGlassSurface>);
  await act(() => useAppSettingsStore.setState((state) => ({ settings: { ...state.settings, reduceDynamicBlur: true } })));
  const surface = screen.getByTestId('material');
  expect(surface.props.glassEffectStyle).toBeUndefined();
  expect(surface.props.intensity).toBeUndefined();
  expect(StyleSheet.flatten(surface.props.style)).toMatchObject({ backgroundColor: '#303030', borderRadius: 22, padding: 12 });
  expect(screen.getByText('Control')).toBeTruthy();
});

it('uses Gym frosted glass with clipping, no expensive Android capture and no extra content layers', async () => {
  const onPress = jest.fn();
  const screen = await render(<Pressable accessibilityLabel="Action" onPress={onPress}>
    <GlassSurfaceFallback testID="surface" style={{ flexDirection: 'row', borderRadius: 22, padding: 12 }}>
      <Text>Play</Text><Text>Next</Text>
    </GlassSurfaceFallback>
  </Pressable>);
  const surface = screen.getByTestId('surface');
  expect(StyleSheet.flatten(surface.props.style)).toMatchObject({ flexDirection: 'row', padding: 12,
    borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' });
  expect(surface.props.experimentalBlurMethod).toBe('none');
  expect(surface.props.tint).toBe('dark');
  expect(surface.props.blurTarget).toBeUndefined();
  expect(screen.getAllByText('Play')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Action'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('uses the copied clear/regular blur strengths and safely maps the legacy thick alias', async () => {
  const screen = await render(<><GlassSurfaceFallback testID="clear" glass="clear" />
    <GlassSurfaceFallback testID="regular" glass="regular" /><GlassSurfaceFallback testID="thick" glass="thick" /></>);
  expect(screen.getByTestId('clear').props.intensity).toBe(24);
  expect(screen.getByTestId('regular').props.intensity).toBe(40);
  expect(screen.getByTestId('thick').props.intensity).toBe(40);
});

it('keeps Apple Liquid Glass native and never sends portable-only props to it', async () => {
  const screen = await render(<AppleGlassSurface testID="native" glass="clear" isInteractive edgeEffects={false}>
    <Text>Native glass</Text>
  </AppleGlassSurface>);
  const surface = screen.getByTestId('native');
  expect(surface.props.glassEffectStyle).toBe('clear');
  expect(surface.props.isInteractive).toBe(true);
  expect(surface.props.edgeEffects).toBeUndefined();
  expect(surface.props.glass).toBeUndefined();
});

it('uses the same native blur fallback on iOS without Liquid Glass', async () => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);
  const screen = await render(<AppleGlassSurface testID="legacy"><Text>Native</Text></AppleGlassSurface>);
  expect(screen.getByTestId('legacy').props.intensity).toBe(40);
  expect(screen.getByTestId('legacy').props.glassEffectStyle).toBeUndefined();
});
