import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AppUpdateScreen } from '../AppUpdateScreen';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../../native/GlassSurface', () => ({ GlassSurface: jest.requireActual('react-native').View }));
jest.mock('../../native/Logged', () => ({ LoggedPressable: jest.requireActual('react-native').Pressable }));
jest.mock('../../native/AppIcon', () => ({ AppIcon: () => null }));

describe('AppUpdateScreen', () => {
  it('shows actual download progress, not an estimated percentage', async () => {
    const screen = await render(<AppUpdateScreen phase="downloading" progress={0.42} />);
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(42);
    await screen.rerender(<AppUpdateScreen phase="downloading" />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('42%')).toBeNull();
  });

  it('offers working retry and continue actions after a failure', async () => {
    const onRetry = jest.fn();
    const onContinue = jest.fn();
    const screen = await render(<AppUpdateScreen phase="error" onRetry={onRetry} onContinue={onContinue} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar no app' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('does not offer dismissal during native reload', async () => {
    const screen = await render(<AppUpdateScreen phase="applying" onContinue={jest.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100);
  });
});
