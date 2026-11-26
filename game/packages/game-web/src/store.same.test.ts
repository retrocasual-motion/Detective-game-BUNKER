import { defaultState } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import { sameState } from './store.ts';

describe('sameState (RV-61)', () => {
  const s = defaultState([]);
  it('новый объект с тем же содержимым — то же; другое поле — нет', () => {
    expect(sameState(s, { ...s, phone: undefined })).toBe(true);
    expect(
      sameState({ ...s, phone: { screen: 'home' } }, { ...s, phone: { screen: 'home' } }),
    ).toBe(true);
    expect(sameState(s, { ...s, view: 'wall' })).toBe(false);
    expect(sameState(s, { ...s, wall: { ...s.wall, items: [] } })).toBe(s.wall.items.length === 0);
  });
});
