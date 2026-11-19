import { type AccessRules, type Content, emptyProgress } from '@bunker/engine';
import { describe, expect, it } from 'vitest';
import { phoneLine } from '../src/phone.ts';

/** Линии — как в пакете v3.4 (правила ЗВОНОК): меню с вводом цифр и автоответчик. */
const rules: AccessRules = {
  version: 1,
  default_reply: { ЗВОНОК: 'Номер не обслуживается.' },
  rules: [
    {
      id: 'call-nc-menu',
      action: 'ЗВОНОК',
      target: '800\\D*555\\D*31\\D*20',
      accept: ['^\\D*$'],
      release: [],
      ok: 'Горячая линия: введите номер партии.',
      fail: 'Партия не зарегистрирована.',
    },
    {
      id: 'call-nc-0418',
      action: 'ЗВОНОК',
      target: '800\\D*555\\D*31\\D*20',
      accept: ['\\b0418\\b'],
      release: [],
      ok: 'Партия 0418: в реестре.',
      fail: 'Партия не зарегистрирована.',
    },
    {
      id: 'call-tom',
      action: 'ЗВОНОК',
      target: '916\\D*555\\D*24\\D*08',
      accept: ['.*'],
      release: [],
      ok: 'Автоответчик: «Привет…» Сигнал.',
    },
  ],
};
const c: Content = { rules, starting: new Map(), locked: new Map() };
const p = emptyProgress();

describe('телефон на столе (6a-3)', () => {
  it('меню: соединение → просьба ввести цифры; верный номер → ответ, меню ждёт снова', () => {
    expect(phoneLine(c, p, '8 800 555-31-20')).toEqual({
      connected: true,
      text: 'Горячая линия: введите номер партии.',
      menu: true,
    });
    expect(phoneLine(c, p, '88005553120', '0418')).toEqual({
      connected: true,
      text: 'Партия 0418: в реестре.',
      menu: true,
    });
    expect(phoneLine(c, p, '88005553120', '1234')).toEqual({
      connected: true,
      text: 'Партия не зарегистрирована.',
      menu: true,
    });
  });

  it('автоответчик — без меню; чужой номер — «не обслуживается»; короткий набор — тоже', () => {
    expect(phoneLine(c, p, '+7 916 555-24-08')).toMatchObject({ connected: true, menu: false });
    expect(phoneLine(c, p, '89161234567')).toEqual({
      connected: false,
      text: 'Номер не обслуживается.',
      menu: false,
    });
    expect(phoneLine(c, p, '555')).toMatchObject({ connected: false });
  });
});
