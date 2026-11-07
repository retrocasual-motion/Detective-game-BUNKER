import type { View } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import { NAV } from './views.ts';

describe('стрелки комнаты', () => {
  it('со стола в любой вид и обратно — противоположной стрелкой', () => {
    const back = { left: 'right', right: 'left', up: 'down', down: 'up' } as const;
    for (const [dir, to] of Object.entries(NAV.desk) as [keyof typeof back, View][]) {
      expect(NAV[to][back[dir]], `стол → ${dir} → ${to}`).toBe('desk');
    }
  });

  it('из каждого вида есть хотя бы одна стрелка', () => {
    for (const exits of Object.values(NAV)) expect(Object.keys(exits).length).toBeGreaterThan(0);
  });

  it('стол связан со всеми тремя видами', () => {
    expect(Object.values(NAV.desk).sort()).toEqual(['left', 'right', 'room']);
  });
});
