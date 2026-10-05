import React from 'react';
import { render } from '@testing-library/react-native';
import { AppIcon, APP_SF_SYMBOLS } from '../AppIcon.ios';
import { SymbolView } from 'expo-symbols';

jest.mock('expo-symbols', () => ({ SymbolView: jest.fn(() => null) }));
describe('native iOS icons', () => {
  it('renders the Apple symbol for lyrics rather than a font glyph', async () => {
    await render(<AppIcon name="chatbubble-ellipses-outline" size={20} color="#FFFFFF" />);
    expect(SymbolView).toHaveBeenCalledWith(expect.objectContaining({
      name: 'quote.bubble', size: 20, tintColor: '#FFFFFF', type: 'monochrome',
    }), undefined);
  });

  it('retains legacy icon sizing and tint while stripping text-only styles from the native view', async () => {
    await render(<AppIcon name="check" style={{ color: '#1ED760', fontSize: 18 }} />);
    const props = jest.mocked(SymbolView).mock.calls.at(-1)![0];
    expect(props.size).toBe(18);
    expect(props.tintColor).toBe('#1ED760');
    expect(props.style).toEqual([{ width: 18, height: 18 }, {}]);
  });

  it('has semantic native mappings for Home, audio, downloads and editing actions', () => {
    for (const name of ['pin', 'radio', 'playlist-plus', 'palette', 'cloud-offline-outline'] as const) {
      expect(APP_SF_SYMBOLS[name]).toBeTruthy();
      expect(APP_SF_SYMBOLS[name]).not.toBe('questionmark');
    }
  });
});
