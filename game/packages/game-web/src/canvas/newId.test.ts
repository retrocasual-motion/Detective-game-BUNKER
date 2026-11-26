import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './geometry.ts';

describe('newId (RV-59)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('без crypto.randomUUID (http в домашней сети) — тоже номер вида UUID, каждый раз новый', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(undefined as never);
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
