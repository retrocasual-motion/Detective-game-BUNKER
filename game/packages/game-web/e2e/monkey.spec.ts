import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * «Обезьянка» (QA-B, общая проверка 20.11): случайные щелчки, перетаскивания, колесо и клавиши
 * по всей игре — стол, стена, вещи в руках, компьютер, телефон, сайты. Ловит то, что обычные
 * тесты не трогают: падения страницы, ошибки в консоли, ответы сервера 5xx, «белый экран».
 * Не в обычном прогоне (случайна): `MONKEY=1 npx playwright test e2e/monkey.spec.ts`.
 * Повторить тот же прогон — `MONKEY_SEED=<число>`; длина — `MONKEY_STEPS` (по умолчанию 800).
 */

test.skip(!process.env.MONKEY, 'только по MONKEY=1');

const SEED = Number(process.env.MONKEY_SEED ?? Date.now() % 100000);
const STEPS = Number(process.env.MONKEY_STEPS ?? 800);

/** Простой ГПСЧ с зерном: прогон можно повторить. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Что не трогать: выход из учётной записи обрывает прогон (это не ошибка игры). */
const SKIP = /Выйти|Выход из|Удалить учётную/i;

const KEYS = [
  'Escape',
  'Enter',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Backspace',
  'Tab',
];
const TYPED = '0123456789*#';

async function clickables(page: Page) {
  return page.evaluate(() => {
    const out: { x: number; y: number; label: string }[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll<HTMLElement>(
      'button, a, [role="button"], [data-testid], input, textarea',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh)
        continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.pointerEvents === 'none') continue;
      out.push({
        x: Math.min(vw - 2, Math.max(2, r.left + r.width / 2)),
        y: Math.min(vh - 2, Math.max(2, r.top + r.height / 2)),
        label: (el.getAttribute('aria-label') ?? el.textContent ?? el.dataset.testid ?? '').slice(
          0,
          60,
        ),
      });
    }
    return out;
  });
}

// MONKEY_OPEN=1 — дело со всем вскрытым: устройства, компьютер, сайты.
test.use({ sealed: !process.env.MONKEY_OPEN, reducedMotion: 'no-preference' });

test(`обезьянка: ${STEPS} случайных действий (зерно ${SEED})`, async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const rand = rng(SEED);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)] as T;
  const problems: string[] = [];
  const log: string[] = [];
  const watch = (p: Page, where: string) => {
    p.on('pageerror', (e) => problems.push(`[${where}] ошибка страницы: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Сеть: отказы 4xx — нормальная часть игры (неверный пароль, нет доступа).
      if (/Failed to load resource: the server responded with a status of 4\d\d/.test(t)) return;
      problems.push(`[${where}] консоль: ${t.slice(0, 300)}`);
    });
    p.on('response', (r) => {
      if (r.status() >= 500) problems.push(`[${where}] сервер ${r.status()}: ${r.url()}`);
    });
  };
  watch(page, 'игра');
  page.context().on('page', (p) => {
    watch(p, 'вкладка');
  });

  const vp = page.viewportSize() ?? { width: 1366, height: 768 };
  for (let i = 0; i < STEPS; i++) {
    // Лишние вкладки (сайты) — иногда поиграть и в них, потом закрыть.
    const pages = page.context().pages();
    const cur = pages.length > 1 && rand() < 0.3 ? (pages[pages.length - 1] as Page) : page;
    if (pages.length > 3) for (const p of pages.slice(1, -1)) await p.close().catch(() => {});
    await cur.bringToFront().catch(() => {});
    const r = rand();
    try {
      if (r < 0.55) {
        const list = (await clickables(cur)).filter((c) => !SKIP.test(c.label));
        if (list.length) {
          const c = pick(list);
          log.push(`${i}: щелчок «${c.label}»`);
          await cur.mouse.click(c.x, c.y);
        }
      } else if (r < 0.68) {
        const x = rand() * vp.width;
        const y = rand() * vp.height;
        log.push(`${i}: щелчок ${Math.round(x)},${Math.round(y)}`);
        await cur.mouse.click(x, y);
      } else if (r < 0.78) {
        const x = rand() * vp.width;
        const y = rand() * vp.height;
        log.push(`${i}: протяжка от ${Math.round(x)},${Math.round(y)}`);
        await cur.mouse.move(x, y);
        await cur.mouse.down();
        await cur.mouse.move(x + (rand() - 0.5) * 400, y + (rand() - 0.5) * 300, { steps: 6 });
        await cur.mouse.up();
      } else if (r < 0.86) {
        log.push(`${i}: колесо`);
        await cur.mouse.move(rand() * vp.width, rand() * vp.height);
        await cur.mouse.wheel(0, (rand() - 0.5) * 900);
      } else if (r < 0.95) {
        const k = pick(KEYS);
        log.push(`${i}: клавиша ${k}`);
        await cur.keyboard.press(k);
      } else {
        const k = pick([...TYPED]);
        log.push(`${i}: набор ${k}`);
        await cur.keyboard.type(k);
      }
    } catch (e) {
      // Элемент исчез между выбором и щелчком — обычное дело для обезьянки.
      log.push(`${i}: (не вышло: ${(e as Error).message.slice(0, 80)})`);
    }
    await cur.waitForTimeout(60);
    // Игра жива: на экране комната, меню, вход или титры — не пустая страница.
    if (i % 50 === 49) {
      // Игра жива: комната, меню, вход или титры. Ждём до 3 с — «Новое дело» перезагружает
      // страницу, миг без экрана — не белый экран.
      const alive = await page
        .locator(
          '[data-testid="room"], [data-testid="main-menu"], [data-testid="login"], [data-testid="credits"]',
        )
        .first()
        .waitFor({ state: 'attached', timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (!alive) {
        problems.push(`шаг ${i}: на экране игры ничего (белый экран?)`);
        await page.screenshot({ path: test.info().outputPath(`alive-${i}.png`) }).catch(() => {});
      }
    }
  }
  if (problems.length) {
    console.log(
      `ЗЕРНО ${SEED}\n${problems.join('\n')}\n--- последние действия:\n${log.slice(-40).join('\n')}`,
    );
  }
  expect(problems, `зерно ${SEED}`).toEqual([]);
});
