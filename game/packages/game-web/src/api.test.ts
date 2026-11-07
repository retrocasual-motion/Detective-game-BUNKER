import { describe, expect, it } from 'vitest';
import { canKeepalive } from './api.ts';

describe('canKeepalive', () => {
  it('считает предел 64 КБ в байтах: 40 000 кириллических символов — слишком много', () => {
    expect(canKeepalive('ж'.repeat(40_000))).toBe(false);
  });
  it('небольшое состояние можно слать с keepalive', () => {
    expect(canKeepalive('{"view":"desk"}')).toBe(true);
  });
});
