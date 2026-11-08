import { describe, expect, it } from 'vitest';
import { NAV } from './views.ts';

describe('стрелки комнаты', () => {
  it('со стола вверх — стена, со стены вниз — стол', () => {
    expect(NAV.desk).toEqual({ up: 'wall' });
    expect(NAV.wall).toEqual({ down: 'desk' });
  });
});
