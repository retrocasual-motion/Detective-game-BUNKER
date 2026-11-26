import { describe, expect, it } from 'vitest';
import { isLocalUrl, startupProblems, startupWarnings } from '../src/startupCheck.ts';

describe('настройки запуска (RV-62)', () => {
  it('локальные и домашние адреса — свои; домен — внешний', () => {
    for (const u of [
      'http://localhost:5173',
      'http://127.0.0.1:8787',
      'http://192.168.1.20:5173',
      'http://10.0.0.5',
      'http://172.20.1.1',
      'http://game.local',
      'http://my-pc:5173',
      'http://100.101.102.103:5173',
    ])
      expect(isLocalUrl(u), u).toBe(true);
    for (const u of ['https://artemwork-work.ru', 'http://8.8.8.8', 'http://172.40.0.1', 'нет'])
      expect(isLocalUrl(u), u).toBe(false);
  });

  it('локально и в домашней сети — как раньше, даже AUTH=off в production (игра для устройств в сети)', () => {
    expect(
      startupProblems({
        production: true,
        auth: 'off',
        mailTransport: 'none',
        publicUrl: 'http://192.168.1.20:8787',
      }),
    ).toEqual([]);
    expect(
      startupProblems({
        production: false,
        auth: 'link',
        mailTransport: 'mailpit',
        publicUrl: 'http://localhost:5173',
      }),
    ).toEqual([]);
  });

  it('внешний адрес: AUTH=off, вход без почты — отказ; разработка — предупреждение; правильная выкладка — да', () => {
    const ext = 'https://bunker.example.org';
    // Разработка на внешнем адресе (туннель) — запускается, с предупреждением.
    const dev = {
      production: false,
      auth: 'link',
      mailTransport: 'mailpit',
      publicUrl: ext,
    } as const;
    expect(startupProblems(dev)).toEqual([]);
    expect(startupWarnings(dev)).toHaveLength(1);
    expect(
      startupProblems({ production: true, auth: 'off', mailTransport: 'none', publicUrl: ext }),
    ).toHaveLength(1);
    expect(
      startupProblems({ production: true, auth: 'link', mailTransport: 'none', publicUrl: ext }),
    ).toHaveLength(1);
    expect(
      startupProblems({ production: true, auth: 'link', mailTransport: 'memory', publicUrl: ext }),
    ).toHaveLength(1);
    expect(
      startupProblems({ production: true, auth: 'link', mailTransport: 'mailpit', publicUrl: ext }),
    ).toEqual([]);
  });
});
