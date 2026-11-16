import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * Стойка радиопоста (этап 4d-1; решения автора 12.11 — PL-A, ST-A, NV-A с правками, PM-A, K8,
 * A-267, «работать прямо на модели»): щелчок по регистратору — вплотную; живой экран — отрезок с
 * тревоги, полосы звука, масштаб и сдвиг шкалы; клавиши на корпусе — «звук ⏮ / ⏭» по видимым
 * полосам; приёмник — ручка со стрелкой и переключатель.
 */

/** Секунды записи для времени регистратора: запись началась 12.10 21:43:12. */
const at = (day: number, h: number, m: number, s = 0) =>
  (day - 12) * 86400 + h * 3600 + m * 60 + s - (21 * 3600 + 43 * 60 + 12);

async function radioUp(page: Page) {
  await page.getByTestId('device-50').click();
  await expect(page.getByTestId('held')).toBeVisible();
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('held')).toHaveAttribute('data-focus', 'recorder');
  await expect(page.getByTestId('radio-strip')).toBeVisible();
}

const range = async (page: Page) => {
  const strip = page.getByTestId('radio-strip');
  const from = Number(await strip.getAttribute('data-view-from'));
  const to = Number(await strip.getAttribute('data-view-to'));
  return { from, to, span: to - from };
};

/** Щелчок по шкале в точке t (по видимой части — data-view-from / -to). */
async function clickAt(page: Page, t: number) {
  const { from, span } = await range(page);
  const box = await page.getByTestId('radio-strip').boundingBox();
  if (!box) throw new Error('нет шкалы');
  await page.mouse.click(box.x + ((t - from) / span) * box.width, box.y + box.height / 2);
}

/** Приблизить шкалу колесом у точки t, пока видно не больше полутора минут. */
async function zoomTo(page: Page, t: number) {
  for (let k = 0; k < 30; k++) {
    const { from, span } = await range(page);
    if (span <= 90) return;
    const box = await page.getByTestId('radio-strip').boundingBox();
    if (!box) throw new Error('нет шкалы');
    await page.mouse.move(box.x + ((t - from) / span) * box.width, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(30);
  }
}

test('отрезок с тревоги; полосы звука; щелчок по шкале — перемотка; дней и «перейти» нет', async ({
  page,
}) => {
  await radioUp(page);
  expect(await page.locator('.rl2-bar').count()).toBeGreaterThan(10);
  await expect(page.getByTestId('radio-overview')).toBeVisible();
  await expect(page.locator('[data-testid^="radio-win-"]')).toHaveCount(0);
  await expect(page.getByTestId('radio-goto-btn')).toHaveCount(0);
  await clickAt(page, at(13, 9, 0));
  await expect(page.getByTestId('radio-counter')).toHaveText(/^13\.10 0[89]:/);
});

test('пауза — «прослушать» эту точку: около 09:00 в эфире всё ещё дикторский голос', async ({
  page,
}) => {
  await radioUp(page);
  await clickAt(page, at(13, 9, 5));
  await expect(page.getByTestId('radio-heard')).toContainText('дикторский');
});

test('колесо — масштаб у курсора, зажать — сдвиг, двойной щелчок — весь отрезок', async ({
  page,
}) => {
  await radioUp(page);
  const full = (await range(page)).span;
  await zoomTo(page, at(13, 8, 45));
  const z = await range(page);
  expect(z.span).toBeLessThan(full / 100);
  const box = await page.getByTestId('radio-strip').boundingBox();
  if (!box) throw new Error('нет шкалы');
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  expect((await range(page)).from).toBeGreaterThan(z.from);
  await page.getByTestId('radio-strip').dblclick();
  expect((await range(page)).span).toBe(full);
});

test('«звук ⏭ / ⏮» — по видимым полосам: крупно в минуте удара — шаги, возня', async ({ page }) => {
  await radioUp(page);
  await zoomTo(page, at(13, 8, 44, 45));
  await clickAt(page, at(13, 8, 44, 40));
  await page.getByTestId('radio-next').click();
  await expect(page.getByTestId('radio-counter')).toHaveText('13.10 08:44:46');
  await expect(page.getByTestId('radio-caption')).toContainText('шаги');
  await page.getByTestId('radio-next').click();
  await expect(page.getByTestId('radio-counter')).toHaveText('13.10 08:44:52');
  await page.getByTestId('radio-prev').click();
  await expect(page.getByTestId('radio-counter')).toHaveText('13.10 08:44:46');
});

test('пуск идёт по записи; метка сохраняется; снимки стойки; Esc — снова в руках', async ({
  page,
}) => {
  await radioUp(page);
  const before = (await page.getByTestId('radio-counter').textContent()) ?? '';
  await page.getByTestId('radio-play').click();
  await expect(page.getByTestId('radio-counter')).not.toHaveText(before);
  await page.getByTestId('radio-play').click();
  await page.getByTestId('radio-mark-add').click();
  await page.getByTestId('radio-mark-label').fill('шаги?');
  await page.getByTestId('radio-mark-save').click();
  await expect(page.getByTestId('radio-mark-0')).toContainText('шаги?');
  await page.getByTestId('radio-photo-1').click();
  await expect(page.getByTestId('radio-photo-text')).toContainText('приёмник');
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveAttribute('data-focus', '');
  await expect(page.getByTestId('radio-strip')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveCount(0);
  await page.reload();
  await radioUp(page);
  await expect(page.getByTestId('radio-mark-0')).toContainText('шаги?');
});

test('приёмник вплотную: ручка ведёт стрелку, переключатель щёлкается; отложили — как при изъятии', async ({
  page,
}) => {
  await page.getByTestId('device-50').click();
  await page.getByTestId('radio-receiver').click();
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('data-focus', 'receiver');
  const hint = page.getByTestId('radio-receiver-hint');
  await expect(hint).toHaveAttribute('data-needle', '0.380');
  await expect(hint).toHaveAttribute('data-mode', 'ПОИСК');
  // Ручка: с клавиатуры — стрелки, мышью — щелчок по краю (кнопка поверх ручки — для клавиатуры).
  await page.keyboard.press('ArrowRight');
  await expect(hint).toHaveAttribute('data-needle', '0.384');
  await page.getByTestId('radio-knob').dispatchEvent('click');
  await expect(hint).toHaveAttribute('data-needle', '0.394');
  // Колесо над ручкой — тоже поворот.
  const knob = await page.getByTestId('radio-knob').boundingBox();
  if (!knob) throw new Error('нет ручки');
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.wheel(0, -100);
  await expect(hint).toHaveAttribute('data-needle', '0.404');
  await page.getByTestId('radio-switch').click();
  await expect(hint).toHaveAttribute('data-mode', 'РУЧН.');
  // Esc — снова стойка в руках; оттуда — к регистратору.
  await page.keyboard.press('Escape');
  await expect(held).toHaveAttribute('data-focus', '');
  await page.getByTestId('device-use').click();
  await expect(held).toHaveAttribute('data-focus', 'recorder');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(held).toHaveCount(0);
  await page.getByTestId('device-50').click();
  await page.getByTestId('radio-receiver').click();
  await expect(hint).toHaveAttribute('data-needle', '0.380');
  await expect(hint).toHaveAttribute('data-mode', 'ПОИСК');
});

test('щелчок мимо стойки вплотную — снова стойка в руках, не положить', async ({ page }) => {
  await radioUp(page);
  await page.mouse.click(30, 300);
  await expect(page.getByTestId('held')).toHaveAttribute('data-focus', '');
  await expect(page.getByTestId('held')).toBeVisible();
});
