import type { Page } from '@playwright/test';
import { expect, sheet, takeDevice, test, toWall } from './fixtures.ts';

/**
 * Ноутбук руководителя (этап 4c-1; решения автора 10.11 — SCR-C, UI-A, PL-A, CL-D, LW-A, PT-A):
 * экраном к игроку, графический ключ, мини-ОС эпохи; файлы остаются на ноутбуке.
 */

const KEY = [5, 1, 2, 3, 6, 9, 8, 7, 4];

/** Ноутбук со стола — в руки — щелчок по экрану: экран крупно. */
async function laptopUp(page: Page) {
  await takeDevice(page, '47');
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Ноутбук/);
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('laptop-view')).toBeVisible();
}

/**
 * Нарисовать ключ мышью через точки. Места всех точек — одним запросом, мышь — в два шага
 * (R4-10: по запросу на точку и шесть шагов ключ из шести попыток не укладывался в 30 с в CI).
 */
async function draw(page: Page, dots: number[]) {
  const places = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<SVGElement>('[data-testid^="laptop-dot-"]')].map((el) => {
        const b = el.getBoundingClientRect();
        return [
          el.dataset.testid?.slice('laptop-dot-'.length),
          { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        ];
      }),
    ),
  );
  const at = (n: number) => {
    const p = places[String(n)];
    if (!p) throw new Error(`нет точки ${n}`);
    return p;
  };
  const first = at(dots[0] ?? 1);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const n of dots.slice(1)) {
    const p = at(n);
    await page.mouse.move(p.x, p.y, { steps: 2 });
  }
  await page.mouse.up();
}

async function unlock(page: Page) {
  await draw(page, KEY);
  await expect(page.getByTestId('laptop-desktop')).toBeVisible();
}

test('экран входа: a.cole, подсказка «наш первый знак»; короткий и неверный ключ — ничего не стирается', async ({
  page,
}) => {
  await laptopUp(page);
  const lock = page.getByTestId('laptop-lock');
  await expect(lock).toContainText('a.cole');
  await expect(lock).toContainText('VAULTLINE · рабочее место руководителя программы');
  await page.getByTestId('laptop-hint').click();
  await expect(page.getByTestId('laptop-hint-text')).toHaveText('наш первый знак');
  await draw(page, [1, 2]);
  await expect(page.getByTestId('laptop-lock-msg')).toContainText('не меньше четырёх');
  await draw(page, [1, 2, 3, 6, 9]);
  await expect(page.getByTestId('laptop-lock-msg')).toHaveText('Неверный ключ');
  // Отвёл взгляд — ноутбук снова в руках.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('laptop-view')).toHaveCount(0);
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Ноутбук/);
});

test('пять неверных ключей — поле молчит 2 минуты, отсчёт на экране (LK-A)', async ({ page }) => {
  await laptopUp(page);
  for (let k = 0; k < 5; k++) {
    await draw(page, [1, 2, 3, 6]);
    await expect(page.getByTestId('laptop-lock-msg')).not.toHaveText('Нарисуйте ключ');
    await expect(page.getByTestId('laptop-lock-msg')).toHaveText(/Нарисуйте ключ|Повторите через/);
  }
  await expect(page.getByTestId('laptop-lock-msg')).toContainText('Повторите через 1:5');
  // Верный ключ во время паузы не принимается.
  await draw(page, KEY);
  await expect(page.getByTestId('laptop-desktop')).toHaveCount(0);
});

test('верный ключ — рабочий стол из канона, часы — время игрока и 16.11.2009; вход сохраняется', async ({
  page,
}) => {
  await laptopUp(page);
  await unlock(page);
  for (const name of [
    'Отчёты',
    'Тревога',
    'Доклад_Р.txt',
    'Сохранённое',
    'Личные дела VL-31',
    'Корзина',
    'Браузер',
    'Принтер',
  ])
    await expect(page.getByTestId(`lap-icon-${name}`)).toBeVisible();
  const now = new Date();
  const hh = `${String(now.getHours()).padStart(2, '0')}:`;
  await expect(page.getByTestId('lap-clock')).toContainText('16.11.2009');
  await expect(page.getByTestId('lap-clock')).toContainText(hh);
  // Блокнот: «Доклад_Р.txt».
  await page.getByTestId('lap-icon-Доклад_Р.txt').dblclick();
  await expect(page.getByTestId('lap-notepad')).toContainText('e.pierce.uk@mailbridge.net');
  // Файлы — на ноутбуке: на стене и во «Входящих» их нет (LW-A).
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveCount(0);
  await expect(sheet(page, 'L563')).toHaveCount(0);
  await expect(page.getByTestId('inbox-L563')).toHaveCount(0);
  // Снова к ноутбуку — ключ уже введён: экран приветствия, «Войти» — рабочий стол.
  await laptopUp(page);
  await expect(page.getByTestId('laptop-welcome')).toContainText('a.cole');
  await page.getByTestId('laptop-enter').click();
  await expect(page.getByTestId('laptop-desktop')).toBeVisible();
});

test('проводник: «Тревога» — записи, «Свойства» у звука; корзина — откуда и когда удалено; таблица расходов', async ({
  page,
}) => {
  await laptopUp(page);
  await unlock(page);
  await page.getByTestId('lap-icon-Тревога').dblclick();
  await expect(page.getByTestId('lap-address')).toHaveText('Рабочий стол › Тревога');
  const take1 = page.getByTestId('lap-file-vneshnee_take1.wav');
  await take1.click({ button: 'right' });
  await page.getByTestId('lap-props').click();
  const props = page.getByTestId('lap-properties');
  await expect(props).toContainText('0:22');
  await expect(props).toContainText('15.09.2009');
  await take1.dblclick();
  await expect(page.getByTestId('lap-player')).toContainText('Внешнее сообщение');
  // Корзина.
  await page.getByTestId('lap-icon-Корзина').dblclick();
  const files = page.getByTestId('lap-files').last();
  await expect(files).toContainText('Исходное расположение');
  await expect(files).toContainText('25.09.2009');
  await page.getByTestId('lap-file-Хейлу_заявление.doc').dblclick();
  await expect(page.getByTestId('lap-doc').last()).toContainText('Причина:');
  // Отчёт о расходах — таблицей.
  await page.getByTestId('lap-icon-Отчёты').dblclick();
  await page.getByTestId('lap-file-расходы_объект_2008-2009.xls').dblclick();
  await expect(page.getByTestId('lap-sheet')).toContainText('Aspen Bank');
});

test('неверный ключ и сразу новый — новый не обрывается (правка автора 10.11)', async ({
  page,
}) => {
  await laptopUp(page);
  await draw(page, [1, 2, 3, 6]);
  await expect(page.getByTestId('laptop-lock-msg')).toHaveText('Неверный ключ');
  // Сразу, пока «Неверный ключ» ещё на экране: отложенная очистка не стирает новый ключ.
  await draw(page, KEY);
  await expect(page.getByTestId('laptop-desktop')).toBeVisible();
});

test('значки двигают; окна и места значков — на месте после выхода и перезагрузки', async ({
  page,
}) => {
  await laptopUp(page);
  await unlock(page);
  const icon = page.getByTestId('lap-icon-Доклад_Р.txt');
  const a = await icon.boundingBox();
  if (!a) throw new Error('нет значка');
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 300, a.y + 60, { steps: 10 });
  await page.mouse.up();
  const b = await icon.boundingBox();
  expect((b?.x ?? 0) - a.x).toBeGreaterThan(200);
  await icon.dblclick();
  await expect(page.getByTestId('lap-notepad')).toBeVisible();
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  await laptopUp(page);
  await page.getByTestId('laptop-enter').click();
  await expect(page.getByTestId('lap-notepad')).toContainText('e.pierce.uk@mailbridge.net');
  const c = await page.getByTestId('lap-icon-Доклад_Р.txt').boundingBox();
  expect(Math.abs((c?.x ?? 0) - (b?.x ?? 0))).toBeLessThan(3);
});

test('значки — по невидимой сетке: отпустили на занятое место — встаёт в соседнюю клетку', async ({
  page,
}) => {
  await laptopUp(page);
  await unlock(page);
  const moving = page.getByTestId('lap-icon-Доклад_Р.txt');
  const target = await page.getByTestId('lap-icon-Отчёты').boundingBox();
  const a = await moving.boundingBox();
  if (!a || !target) throw new Error('нет значков');
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2 + 7, target.y + 25, { steps: 10 });
  await page.mouse.up();
  const b = await moving.boundingBox();
  if (!b) throw new Error('нет значка');
  // Не на «Отчётах» и ровно в клетке сетки (12 × 9 по всему экрану).
  const screen = await page.locator('.lap-screen').boundingBox();
  if (!screen) throw new Error('нет экрана');
  const k = screen.width / 1280;
  const kx = (b.x - target.x) / (((1280 - 12) / 12) * k);
  const ky = (b.y - target.y) / (((766 - 12) / 9) * k);
  expect(Math.abs(kx) + Math.abs(ky)).toBeGreaterThan(0.9);
  expect(Math.abs(kx - Math.round(kx))).toBeLessThan(0.05);
  expect(Math.abs(ky - Math.round(ky))).toBeLessThan(0.05);
});

test('сетка равномерная: в правом нижнем углу значок стоит так же, как в левом верхнем', async ({
  page,
}) => {
  await laptopUp(page);
  await unlock(page);
  const screen = await page.locator('.lap-screen').boundingBox();
  const bar = await page.locator('.lap-taskbar').boundingBox();
  const first = await page.getByTestId('lap-icon-Отчёты').boundingBox();
  const icon = page.getByTestId('lap-icon-Распорядок.doc');
  const a = await icon.boundingBox();
  if (!screen || !bar || !first || !a) throw new Error('нет экрана');
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(screen.x + screen.width - 5, bar.y - 5, { steps: 12 });
  await page.mouse.up();
  const b = await icon.boundingBox();
  if (!b) throw new Error('нет значка');
  const left = first.x - screen.x;
  const right = screen.x + screen.width - (b.x + b.width);
  expect(Math.abs(left - right)).toBeLessThan(2);
  // По вертикали так же: поле под нижней строкой (до панели задач) = полю над верхней.
  const k = screen.width / 1280;
  const top = first.y - screen.y;
  const bottom = bar.y - (b.y + 76 * k);
  expect(Math.abs(top - bottom)).toBeLessThan(2);
});

test('вплотную — та же вещь (WM-B): правая кнопка на экране — его; мимо ноутбука — снова в руках', async ({
  page,
}) => {
  await laptopUp(page);
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('data-focus', 'laptop');
  // Правая кнопка по экрану — меню экрана, не «отойти».
  await page.mouse.click(683, 400, { button: 'right' });
  await expect(page.getByTestId('laptop-view')).toBeVisible();
  // Правая кнопка мимо ноутбука — снова вещь в руках.
  await page.mouse.click(1345, 420, { button: 'right' });
  await expect(held).toHaveAttribute('data-focus', '');
  await expect(page.getByTestId('laptop-view')).toHaveCount(0);
  await expect(held).toBeVisible();
});

test('выписка с ноутбука: по ссылке — сразу файл, без «Войти» (7.5, автор 21.11)', async ({
  page,
}) => {
  await laptopUp(page);
  await unlock(page);
  await page.getByTestId('lap-icon-Доклад_Р.txt').dblclick();
  const pad = page.getByTestId('lap-notepad');
  await expect(pad).toContainText('e.pierce.uk@mailbridge.net');
  await pad.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf('e.pierce.uk@mailbridge.net');
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 'e.pierce.uk@mailbridge.net'.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      n.parentElement?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
  });
  await page.getByTestId('laptop-to-wall').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveCount(0);
  await toWall(page);
  await page.locator('.paper-excerpt .excerpt-text').click();
  await expect(page.getByTestId('laptop-desktop')).toBeVisible();
  await expect(page.getByTestId('laptop-welcome')).toHaveCount(0);
  await expect(page.getByTestId('lap-notepad')).toBeVisible();
});
