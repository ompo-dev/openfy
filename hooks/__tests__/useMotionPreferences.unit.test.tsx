import { renderHook } from '@testing-library/react-native';
import * as Motion from 'react-native-reanimated';
import { useMotionPreferences } from '../useMotionPreferences';

let mockAppReduced = false;
jest.mock('../../stores/useAppSettingsStore', () => ({
  useAppSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { reduceAnimations: mockAppReduced } }),
}));

it('honors app and system motion preferences independently', async () => {
  const system = jest.spyOn(Motion, 'useReducedMotion').mockReturnValue(false);
  try {
    mockAppReduced = false;
    const hook = await renderHook(() => useMotionPreferences());
    expect(hook.result.current).toBe(false);
    mockAppReduced = true;
    await hook.rerender();
    expect(hook.result.current).toBe(true);
    mockAppReduced = false;
    system.mockReturnValue(true);
    await hook.rerender();
    expect(hook.result.current).toBe(true);
  } finally { system.mockRestore(); mockAppReduced = false; }
});
