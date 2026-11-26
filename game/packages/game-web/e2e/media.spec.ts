import { expect, STRIP, sheet, siteInPc, takeDevice, test, toWall } from './fixtures.ts';

/**
 * Записи там, где лежат (этап 4d; PL-A, автор 12.11): ручка-диктофон — назад · play · вперёд;
 * фильм, ролики, голосовая почта — плеером вместо листа. Звука нет — расшифровка или описание по месту.
 */

test('ручка-диктофон: play — расшифровка; вперёд — следующий файл; Esc — снова в руках', async ({
  page,
}) => {
  await takeDevice(page, '49');
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('pen-view')).toBeVisible();
  await expect(page.getByTestId('media-name')).toContainText('1 из 7');
  await page.getByTestId('media-play').click();
  await expect(page.getByTestId('media-time')).not.toHaveText('0:00 / 0:25');
  for (let k = 0; k < 3; k++) await page.getByTestId('media-fwd').click();
  await expect(page.getByTestId('media-name')).toContainText('REC004');
  await expect(page.getByTestId('media-caption')).toContainText('Тоффи');
  // «Назад» в начале файла — предыдущий файл (как на диктофонах).
  await page.getByTestId('media-back').click();
  await expect(page.getByTestId('media-name')).toContainText('REC003');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pen-view')).toHaveCount(0);
  await expect(page.getByTestId('held')).toBeVisible();
});

test('голосовая почта Хейла (21) — плеер со списком сообщений; фильм (13) — подпись по месту', async ({
  page,
}) => {
  await toWall(page);
  await sheet(page, '21').click({ position: STRIP.position });
  await expect(page.getByTestId('media-player')).toBeVisible();
  await page.getByTestId('media-file-2').click();
  await expect(page.getByTestId('media-caption')).toContainText('Сообщение 2');
  await page.keyboard.press('Escape');
  await sheet(page, '13').click({ position: STRIP.position });
  await expect(page.getByTestId('media-player')).toBeVisible();
  const bar = await page.getByTestId('media-bar').boundingBox();
  if (!bar) throw new Error('нет шкалы');
  await page.mouse.click(bar.x + bar.width * 0.1, bar.y + bar.height / 2);
  await expect(page.getByTestId('media-caption')).toContainText('Р. Хейл');
});

test('сайт hexon-bio.com (L163): страница читается, старый фильм — плеером на своём месте', async ({
  page,
}) => {
  // Сайт — в браузере компьютера следователя (A-288 п. 9), фильм — плеером на странице.
  const tab = await siteInPc(page, 'hexon-bio.com');
  const viewer = tab.getByTestId('site');
  await expect(viewer).toContainText('Руководство');
  await expect(viewer).toContainText('Контакты');
  await expect(viewer.getByTestId('media-player')).toBeVisible();
  // 0:10 из 0:24 — строка с человеком в лаборатории (шкала — ниже по странице).
  const bar = tab.getByTestId('media-bar');
  await bar.scrollIntoViewIfNeeded();
  const box = await bar.boundingBox();
  if (!box) throw new Error('нет шкалы');
  await bar.click({ position: { x: (box.width * 10) / 24, y: box.height / 2 } });
  await expect(tab.getByTestId('media-caption')).toContainText('Р. Хейл');
});
