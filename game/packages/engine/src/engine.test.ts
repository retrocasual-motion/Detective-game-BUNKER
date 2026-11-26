import { describe, expect, it } from 'vitest';
import { act, type Content } from './engine.ts';
import { pyRegex } from './pyre.ts';
import { norm, qnorm } from './text.ts';
import { type AccessRules, emptyProgress } from './types.ts';
import { parseActionLine } from './walk.ts';

describe('pyRegex — шаблоны Python в JavaScript', () => {
  it('границы слов и буквы (\\b, \\w) работают с русскими словами, как в Python', () => {
    expect(pyRegex(String.raw`\bп\s*-?\s*0?1\b`).test('листать п-01')).toBe(true);
    expect(pyRegex(String.raw`\bп\s*-?\s*0?1\b`).test('листать сп-01')).toBe(false);
    expect(pyRegex(String.raw`фото\w*`).exec('фотографии')?.[0]).toBe('фотографии');
    expect(pyRegex(String.raw`\W+`).test('«')).toBe(true);
  });

  it('без учёта регистра и с кириллицей', () => {
    expect(pyRegex('^ноутбук').test('НОУТБУК руководителя')).toBe(true);
  });

  it('экранированные обычные символы и дефис в классе', () => {
    expect(pyRegex(String.raw`(?<![\d.:,/-])05(?![\d.:])`).test('пользователь 05')).toBe(true);
    expect(pyRegex(String.raw`(?<![\d.:,/-])05(?![\d.:])`).test('05.10')).toBe(false);
  });
});

describe('norm, qnorm', () => {
  it('ё → е, кавычки и точки по краям убраны', () => {
    expect(norm('  «Ещё раз.»  ')).toBe('еще раз');
    expect(qnorm('Дело № 09-1128, ЁЖ')).toBe('дело № 09 1128 еж');
  });
});

const rules: AccessRules = {
  version: 1,
  attempt_limit: { ПАРОЛЬ: 3 },
  final_form: { release: 'L999' },
  rules: [
    {
      id: 'pw',
      action: 'ПАРОЛЬ',
      target: 'сейф',
      accept: ['^верно$'],
      release: ['L1'],
      ok: 'Открыто.',
      fail: 'Неверно.',
      again: 'Уже.',
    },
    {
      id: 'form',
      action: 'РЕШИТЬ',
      target: '.*',
      accept: ['продолж'],
      release: ['L999'],
      ok: 'Форма.',
    },
  ],
};
const content: Content = {
  rules,
  starting: new Map([['01', 'текст']]),
  locked: new Map([
    ['L1', 'закрытый'],
    ['L999', 'форма'],
  ]),
};
const MIN = 60_000;

describe('act', () => {
  it('верный пароль открывает материал, повтор — «повтор»', () => {
    const a = act(
      content,
      emptyProgress(),
      { action: 'ПАРОЛЬ', target: 'сейф', value: 'Верно' },
      0,
    );
    expect(a.outcome).toMatchObject({ result: 'успех', released: ['L1'], reply: 'Открыто.' });
    const b = act(content, a.progress, { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' }, 1);
    expect(b.outcome.result).toBe('повтор');
  });

  it('три неверные попытки — пауза 10 минут; после паузы поле снова принимает (T-11-A)', () => {
    let p = emptyProgress();
    for (let i = 0; i < 3; i++) {
      p = act(content, p, { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' }, i * 1000).progress;
    }
    const blocked = act(content, p, { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' }, 5 * MIN);
    expect(blocked.outcome.result).toBe('лимит');
    const later = act(content, p, { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' }, 11 * MIN);
    expect(later.outcome.result).toBe('успех');
  });

  it('RV-31: верный ввод сбрасывает счёт — пауза только после трёх неверных подряд', () => {
    let p = emptyProgress();
    const t = (value: string, at: number) => {
      const r = act(content, p, { action: 'ПАРОЛЬ', target: 'сейф', value }, at);
      p = r.progress;
      return r.outcome.result;
    };
    t('нет', 0);
    t('нет', 1);
    expect(t('верно', 2)).toBe('успех');
    t('нет', 3);
    t('нет', 4);
    expect(t('верно', 5)).not.toBe('лимит');
  });

  it('поле поиска (DS-B) не считает промахи: после трёх — не пауза, а снова ответ', () => {
    const cfg = { pauseMs: 2 * MIN, unlimited: ['сейф'] };
    let p = emptyProgress();
    for (let i = 0; i < 5; i++) {
      const r = act(content, p, { action: 'ПАРОЛЬ', target: 'Сейф', value: 'нет' }, i, cfg);
      expect(r.outcome.result).toBe('отказ');
      p = r.progress;
    }
    expect(p.fails).toEqual({});
  });

  it('неверный ввод ничего не стирает и не меняет исходный прогресс (P-4)', () => {
    const p0 = emptyProgress();
    const r = act(content, p0, { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' }, 0);
    expect(p0.fails).toEqual({});
    expect(r.progress.released).toEqual([]);
  });

  it('после «Решить дело» новые действия закрыты (P-9)', () => {
    const f = act(
      content,
      emptyProgress(),
      { action: 'РЕШИТЬ', target: 'дело', value: 'продолжить' },
      0,
    );
    expect(f.outcome.released).toEqual(['L999']);
    const pw = act(content, f.progress, { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' }, 1);
    expect(pw.outcome.result).toBe('форма открыта');
  });

  it('неизвестная цель — «нет правила» с ответом по умолчанию', () => {
    const r = act(content, emptyProgress(), { action: 'ПАРОЛЬ', target: 'дверь', value: 'x' }, 0);
    expect(r.outcome.result).toBe('нет правила');
  });
});

describe('pyRegex — тонкости Python', () => {
  it('\\d — любые десятичные цифры Unicode, «.» не совпадает только с \\n', () => {
    expect(pyRegex(String.raw`^\d{2}$`).test('１２')).toBe(true);
    expect(pyRegex(String.raw`^\D*$`).test('１')).toBe(false);
    expect(pyRegex('^a.b$').test('a\rb')).toBe(true);
    expect(pyRegex('^a.b$').test('a\nb')).toBe(false);
  });
});

describe('доставка открытого и форма заключения в игре', () => {
  it('ФИНАЛ после «Решить дело» — со следующего действия, без отдельной доставки', () => {
    const f = act(
      content,
      emptyProgress(),
      { action: 'РЕШИТЬ', target: 'дело', value: 'продолжить' },
      0,
    );
    const fin = act(content, f.progress, { action: 'ФИНАЛ', target: 'дело', value: '' }, 1);
    expect(fin.outcome.result).toBe('конец');
  });

  it('в сквозном проходе (autoSeen: false) — только после границы раунда', () => {
    const f = act(
      content,
      emptyProgress(),
      { action: 'РЕШИТЬ', target: 'дело', value: 'продолжить' },
      0,
    );
    const fin = act(
      content,
      f.progress,
      { action: 'ФИНАЛ', target: 'дело', value: '' },
      1,
      undefined,
      {
        autoSeen: false,
      },
    );
    expect(fin.outcome.result).toBe('нет формы');
  });

  it('давние неверные попытки удаляются из прогресса', () => {
    const a = act(content, emptyProgress(), { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' }, 0);
    expect(Object.keys(a.progress.fails)).toHaveLength(1);
    // Действие без лимита попыток: новых записей не добавляет, давние — убирает.
    const b = act(
      content,
      a.progress,
      { action: 'РЕШИТЬ', target: 'дело', value: 'нет' },
      11 * MIN,
    );
    expect(Object.keys(b.progress.fails)).toHaveLength(0);
  });
});

describe('служебная строка', () => {
  it('строка из сквозного прохода — целиком: ожидание и комментарий отрезаются', () => {
    expect(parseActionLine('АДРЕС | браузер | vaultline-program.com => L101  # сайт')).toEqual({
      action: 'АДРЕС',
      target: 'браузер',
      value: 'vaultline-program.com',
    });
  });
});

describe('лимит попыток не обходится словом в цели (RV-64)', () => {
  const pw = (target: string, value: string, p = emptyProgress(), t = 0) =>
    act(content, p, { action: 'ПАРОЛЬ', target, value }, t);

  it('«сейф», «сейф газета», «сейф 2» — один счётчик: на четвёртой попытке — пауза', () => {
    let p = emptyProgress();
    for (const t of ['сейф', 'сейф газета', 'сейф 2']) p = pw(t, 'нет', p).progress;
    expect(pw('сейф 3', 'верно', p).outcome.result).toBe('лимит');
  });

  it('цель, что не подходит ни к одному полю, — общий счётчик действия, а не новый на каждое слово', () => {
    let p = emptyProgress();
    for (const t of ['абв', 'где', 'жзи']) p = pw(t, 'нет', p).progress;
    expect(pw('клм', 'нет', p).outcome.result).toBe('лимит');
  });
});
