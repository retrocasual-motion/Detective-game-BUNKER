import type { View } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import { NAV } from './views.ts';

describe('стрелки комнаты', () => {
  it('со стола в любой вид и обратно к столу одной стрелкой', () => {
    for (const to of Object.values(NAV.desk) as View[]) {
      expect(Object.values(NAV[to]), `стол → ${to} → стол`).toContain('desk');
    }
  });

  it('стрелка вниз на каждом виде ведёт в комнату, из комнаты — к столу', () => {
    for (const v of ['desk', 'left', 'right'] as const) expect(NAV[v].down).toBe('room');
    expect(NAV.room.down).toBe('desk');
    for (const exits of Object.values(NAV)) expect(exits.up).toBeUndefined();
  });

  it('из каждого вида есть хотя бы одна стрелка', () => {
    for (const exits of Object.values(NAV)) expect(Object.keys(exits).length).toBeGreaterThan(0);
  });

  it('стол связан со всеми тремя видами', () => {
    expect(Object.values(NAV.desk).sort()).toEqual(['left', 'right', 'room']);
  });
});
