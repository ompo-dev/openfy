import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { StyleSheet } from 'react-native';
import { LyricSyncEditor } from '../LyricSyncEditor';

jest.mock('../../Home/FriendActivityStatus/MusicTimelineSelector', () => ({
  MusicTimelineSelector: () => null,
}));
jest.mock('../../Home/FriendActivityStatus/MusicWaveformReel', () => ({
  MusicWaveformReel: () => null,
}));
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(),
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

const segments = [
  { index: 0, startTimeMs: 5000, endTimeMs: 11000, text: 'Primeira frase' },
  { index: 1, startTimeMs: 11000, endTimeMs: 18000, text: 'Segunda frase' },
];

const props = (onApplySegments = jest.fn()) => ({
  currentPositionMs: 6000,
  isPlaying: false,
  onApplySegments,
  onMove: jest.fn(),
  onResizeEnd: jest.fn(),
  onResizeStart: jest.fn(),
  onScrubEnd: jest.fn(),
  onScrubStart: jest.fn(),
  onTogglePlayPause: jest.fn(),
  selectedRange: segments[0],
  segments,
  totalDurationMs: 30000,
  waveformSeed: 'Test track',
});

describe('LyricSyncEditor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exposes timeline actions and applies a pasted JSON timeline', async () => {
    const onApplySegments = jest.fn();
    const screen = await render(<LyricSyncEditor {...props(onApplySegments)} />);
    expect(screen.getByText('INICIO')).toBeTruthy();
    expect(screen.getByText('5,000 s')).toBeTruthy();
    expect(screen.getByText('11,000 s')).toBeTruthy();
    expect(screen.getByText('6,000 s')).toBeTruthy();
    expect(screen.getByLabelText('Abrir JSON da letra')).toBeTruthy();
    expect(screen.getByLabelText('Copiar JSON da letra')).toBeTruthy();
    expect(screen.queryByLabelText('Ir para o inicio do trecho')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Abrir JSON da letra'));
    expect(screen.getByText('JSON da letra')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('lyrics-json-code-frame').props.style)).toMatchObject({ flex: 1, minHeight: 0 });
    await fireEvent.press(screen.getByLabelText('Editar JSON'));
    expect(screen.getByText('"segments"').props.style.color).toBe('#8BD5FF');
    const input = screen.getByLabelText('Conteudo JSON da letra');
    await fireEvent.changeText(input, JSON.stringify({ segments: [
      { startTimeMs: 0, endTimeMs: 1000, text: 'Importada' },
    ] }));
    await fireEvent.press(screen.getByLabelText('Aplicar JSON da letra'));
    expect(onApplySegments).toHaveBeenCalledWith([
      { index: 0, startTimeMs: 0, endTimeMs: 1000, text: 'Importada' },
    ]);
  });

  it('formats and copies the current timeline as JSON', async () => {
    const screen = await render(<LyricSyncEditor {...props()} />);
    await fireEvent.press(screen.getByLabelText('Copiar JSON da letra'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('"segments"'));
    await fireEvent.press(screen.getByLabelText('Abrir JSON da letra'));
    await fireEvent.press(screen.getByLabelText('Formatar JSON'));
    expect(screen.getByText('JSON formatado')).toBeTruthy();
  });
});
