/* eslint-disable @typescript-eslint/no-require-imports -- Hoisted Jest factories load their mocked components. */
import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { GlassSurfaceFallback } from '../GlassSurfaceFallback';
import { GlassSurface as AppleGlassSurface } from '../GlassSurface.ios';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { GlassBackdrop, GlassBackdropProvider, GlassBackdropScope, WithoutGlassBackdrop } from '../GlassBackdrop';
import { GlassScreenBackdrop } from '../GlassScreenBackdrop';
import { GLASS_MATERIALS, glassTint, supportsAndroidGlassBlur } from '../glassMaterial';

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: View,
    BlurTargetView: React.forwardRef(function MockBlurTarget(props: any, ref: any) {
      return <View testID="capture" {...props} ref={ref} />;
    }),
  };
});
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: any) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: jest.fn(() => true),
}));

const originalOS = Platform.OS;
const hidden = { includeHiddenElements: true };
const originalVersion = Platform.Version;
function platform(os: string, version: number = 35) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: version });
}
afterEach(() => {
  platform(originalOS, originalVersion as number);
});

describe('portable glass material', () => {
  it('uses light blur for controls and stronger diffusion for sheets', () => {
    expect(GLASS_MATERIALS.clear.blur).toBeLessThan(GLASS_MATERIALS.regular.blur);
    expect(GLASS_MATERIALS.regular.blur).toBeLessThan(GLASS_MATERIALS.thick.blur);
    expect(GLASS_MATERIALS.thick.opacity).toBeLessThan(0.65);
  });

  it('never enables the costly Android pre-31 capture path', () => {
    expect(supportsAndroidGlassBlur('android', 30)).toBe(false);
    expect(supportsAndroidGlassBlur('android', 31)).toBe(true);
    expect(supportsAndroidGlassBlur('web', 35)).toBe(false);
    expect(supportsAndroidGlassBlur('ios', 26)).toBe(false);
  });

  it('keeps opaque tint colors translucent and respects explicit alpha', () => {
    expect(glassTint('#252525', 0.32)).toBe('rgba(37,37,37,0.32)');
    expect(glassTint('transparent', 0.32)).toBe('rgba(0,0,0,0)');
    expect(glassTint(undefined, 0.18)).toBe('rgba(26,28,30,0.18)');
    expect(glassTint('rgba(255,255,255,0.5)', 0.32)).toMatch(/^rgba\(255,255,255,0\.50/);
  });

  it('uses web backdrop diffusion without shifting the content or intercepting taps', async () => {
    platform('web');
    const onPress = jest.fn();
    const screen = await render(<Pressable accessibilityLabel="Action" onPress={onPress}>
      <GlassSurfaceFallback testID="surface" style={{ flexDirection: 'row', borderRadius: 22, padding: 12 }}>
        <Text>Play</Text><Text>Next</Text>
      </GlassSurfaceFallback>
    </Pressable>);
    const style = StyleSheet.flatten(screen.getByTestId('surface').props.style);
    expect(style.flexDirection).toBe('row');
    expect(style.padding).toBe(12);
    expect(style.borderWidth).toBeUndefined();
    expect(screen.getByTestId('glass-material', hidden).props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(screen.getByTestId('glass-tint', hidden).props.style).backdropFilter).toBe('saturate(160%) blur(5px)');
    expect(StyleSheet.flatten(screen.getByTestId('glass-rim', hidden).props.style).borderRadius).toBe(22);
    await fireEvent.press(screen.getByLabelText('Action'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps large surfaces free of raised edges and shadows', async () => {
    platform('web');
    const screen = await render(<GlassSurfaceFallback testID="sheet" glass="thick" edgeEffects={false}><Text>Content</Text></GlassSurfaceFallback>);
    expect(screen.queryByTestId('glass-rim', hidden)).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('sheet').props.style).boxShadow).toBeUndefined();
  });

  it('captures sibling backgrounds on Android without capturing itself', async () => {
    platform('android');
    const screen = await render(<GlassBackdropScope>
      <GlassBackdrop style={{ height: 400 }}>
        <GlassSurfaceFallback testID="inside"><Text>Inside capture</Text></GlassSurfaceFallback>
      </GlassBackdrop>
      <GlassSurfaceFallback testID="outside"><Text>Overlay</Text></GlassSurfaceFallback>
    </GlassBackdropScope>);
    expect(within(screen.getByTestId('inside')).queryByTestId('glass-live-blur', hidden)).toBeNull();
    const blur = within(screen.getByTestId('outside')).getByTestId('glass-live-blur', hidden);
    expect(blur.props.blurMethod).toBe('dimezisBlurViewSdk31Plus');
    expect(blur.props.blurTarget).toBeTruthy();
    expect(blur.props.blurReductionFactor).toBe(4);
  });

  it('shares the focused page with floating chrome and releases it on exit', async () => {
    platform('android');
    function Example({ page }: { page: boolean }) {
      return <GlassBackdropProvider>
        {page ? <GlassScreenBackdrop><Text>Page</Text></GlassScreenBackdrop> : null}
        <GlassSurfaceFallback><Text>Floating player</Text></GlassSurfaceFallback>
      </GlassBackdropProvider>;
    }
    const screen = await render(<Example page />);
    expect(screen.getByTestId('glass-live-blur', hidden)).toBeTruthy();
    await act(() => screen.rerender(<Example page={false} />));
    expect(screen.queryByTestId('glass-live-blur', hidden)).toBeNull();
  });

  it('does not reuse a capture across native modal windows', async () => {
    platform('android');
    const screen = await render(<GlassBackdropScope><WithoutGlassBackdrop>
      <GlassSurfaceFallback><Text>New window</Text></GlassSurfaceFallback>
    </WithoutGlassBackdrop></GlassBackdropScope>);
    expect(screen.queryByTestId('glass-live-blur', hidden)).toBeNull();
  });

  it('keeps older Android translucent without native blur or capture nodes', async () => {
    platform('android', 30);
    const screen = await render(<GlassBackdropScope><GlassBackdrop><Text>Artwork</Text></GlassBackdrop>
      <GlassSurfaceFallback><Text>Play</Text></GlassSurfaceFallback>
    </GlassBackdropScope>);
    expect(screen.queryByTestId('capture')).toBeNull();
    expect(screen.queryByTestId('glass-live-blur', hidden)).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('glass-tint', hidden).props.style).backgroundColor).toBe('rgba(26,28,30,0.32)');
  });

  it('preserves the legacy native iOS blur', async () => {
    platform('ios', 25);
    const screen = await render(<GlassSurfaceFallback testID="legacy"><Text>Native</Text></GlassSurfaceFallback>);
    expect(screen.getByTestId('legacy').props.intensity).toBe(40);
    expect(screen.queryByTestId('glass-material')).toBeNull();
  });

  it('keeps Apple Liquid Glass native and does not send portable-only props to it', async () => {
    platform('ios', 26);
    jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
    const screen = await render(<AppleGlassSurface testID="native" glass="clear" isInteractive edgeEffects={false}><Text>Native glass</Text></AppleGlassSurface>);
    expect(screen.getByTestId('native').props.glassEffectStyle).toBe('clear');
    expect(screen.getByTestId('native').props.isInteractive).toBe(true);
    expect(screen.getByTestId('native').props.edgeEffects).toBeUndefined();
    expect(screen.queryByTestId('glass-material', hidden)).toBeNull();
  });
});
