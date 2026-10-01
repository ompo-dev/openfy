import { clearCommandStateForTests, executeCommand } from '../commandBus';

describe('executeCommand', () => {
  beforeEach(clearCommandStateForTests);

  it('coalesces in-flight work and briefly replays a successful result', async () => {
    const execute = jest.fn().mockResolvedValue({ saved: true });
    const command = {
      name: 'test.save',
      idempotencyKey: 'record-1',
      execute,
    };

    const [first, concurrent] = await Promise.all([
      executeCommand(command),
      executeCommand(command),
    ]);
    const replay = await executeCommand(command);

    expect(first).toEqual({ saved: true });
    expect(concurrent).toBe(first);
    expect(replay).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not cache unsuccessful results or throw-away retries', async () => {
    const execute = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const command = {
      name: 'test.retry',
      idempotencyKey: 'record-2',
      successTtlMs: 10_000,
      isSuccess: Boolean,
      execute,
    };

    await expect(executeCommand(command)).resolves.toBe(false);
    await expect(executeCommand(command)).resolves.toBe(true);

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
