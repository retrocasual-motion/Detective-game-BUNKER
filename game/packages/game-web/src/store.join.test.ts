import { defaultState, JOINS, type Material, pieceItemId } from '@bunker/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mat = (id: string): Material => ({
  id,
  title: `Материал ${id}`,
  placement: 'desk',
  kind: 'sheet',
  body: '',
  sourceFile: `${id}__x.md`,
});

// Сервер отвечает с задержкой — как в находке RV-18.
let answer: () => void = () => {};
vi.mock('./api.ts', () => ({
  PAGE_ID: 'p-test',
  postAction: vi.fn(
    () =>
      new Promise((resolve) => {
        answer = () => resolve({ reply: '', released: [mat('L990')] });
      }),
  ),
  putState: vi.fn(async () => {}),
  getState: vi.fn(),
  getMaterials: vi.fn(),
  getExcerpts: vi.fn(async () => []),
  ackExcerpts: vi.fn(async () => {}),
}));

const { useGame } = await import('./store.ts');
const j = JOINS[0];
if (!j) throw new Error('нет пары половин');

describe('RV-18: сведение половин на стене', () => {
  beforeEach(() => {
    const materials = [mat('42'), mat('51')];
    const s = defaultState(materials);
    s.pieces = ['42/1'];
    s.wall.items.push(
      { id: '51', x: 0, y: 0, z: 1, rot: 0 },
      { id: pieceItemId('42/1'), x: 0, y: 100, z: 2, rot: 0 },
    );
    useGame.setState({ materials, state: s });
  });

  it('второй запуск, пока сервер отвечает, не снимает готовый лист со стены', async () => {
    const first = useGame.getState().joinOnWall(j);
    const second = useGame.getState().joinOnWall(j);
    answer();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    // И уже совмещённое не сводится снова.
    expect(await useGame.getState().joinOnWall(j)).toBe(false);
    const st = useGame.getState().state;
    expect(st?.joined).toEqual(['L990']);
    expect(st?.wall.items.some((i) => i.id === 'L990')).toBe(true);
  });
});
