import { describe, expect, it } from 'vitest';
import { addReading, mmss, readingRows, readingTsv } from './readingLog.ts';

describe('время чтения (RD-A)', () => {
  it('складывает время и открытия; таблица — дольше всего сверху', () => {
    let log = addReading({}, '04', 0, 1);
    log = addReading(log, '04', 95_000);
    log = addReading(log, 'L214', 30_000, 1);
    const rows = readingRows(log, new Map([['04', 'Опись']]));
    expect(rows).toEqual([
      { id: '04', title: 'Опись', seconds: 95, opens: 1 },
      { id: 'L214', title: '', seconds: 30, opens: 1 },
    ]);
    expect(mmss(95)).toBe('1:35');
    expect(readingTsv(rows).split('\n')[1]).toBe('04\tОпись\t1:35\t1');
  });
});
