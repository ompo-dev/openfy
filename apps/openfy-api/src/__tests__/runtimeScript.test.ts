import { describe, expect, it } from 'bun:test';
import packageJson from '../../package.json';

describe('Next runtime scripts', () => {
  it('does not force Next to run inside Bun', () => {
    expect(packageJson.scripts.dev).not.toContain('bun --bun next');
    expect(packageJson.scripts.start).not.toContain('bun --bun next');
  });
});
