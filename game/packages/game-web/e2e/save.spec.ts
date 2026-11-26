import type { Page } from '@playwright/test';
import { E2E_EMAIL, expect, savedPut, test, toWall } from './fixtures.ts';

/** Сменить вид комнаты — изменение, которое уходит в сохранение. */
async function change(page: Page) {
  const scene = page.getByTestId('scene');
  const view = await scene.getAttribute('data-view');
  await page.keyboard.press(view === 'wall' ? 'ArrowDown' : 'ArrowUp');
  await expect(scene).toHaveAttribute('data-view', view === 'wall' ? 'desk' : 'wall');
}

test('DEV-A: дело открыли на другом устройстве — здесь «Дело открыто в другом месте»', async ({
  page,
  browser,
}) => {
  // Второе устройство — свой браузер, тот же игрок.
  const other = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page2 = await other.newPage();
  await page2.request.post('/api/dev/login', { data: { email: E2E_EMAIL } });
  await page2.goto('/?play');
  await expect(page2.getByTestId('room')).toBeVisible();

  await change(page);
  await expect(page.getByTestId('elsewhere')).toBeVisible();
  await expect(page.getByTestId('elsewhere')).toContainText('на другом устройстве');

  // Второе сохраняет, как обычно.
  const saved = savedPut(page2);
  await change(page2);
  expect((await saved).status()).toBe(204);
  await expect(page2.getByTestId('elsewhere')).toHaveCount(0);
  await other.close();
});

test('RV-50: сервер не принял сохранение — надпись; следующее изменение сохраняется', async ({
  page,
}) => {
  let refuse = true;
  await page.route('**/api/state', (route) =>
    route.request().method() === 'PUT' && refuse
      ? route.fulfill({ status: 400, body: '{"error":"неверное состояние"}' })
      : route.continue(),
  );
  await change(page);
  await expect(page.getByTestId('save-rejected')).toBeVisible();
  refuse = false;
  const saved = savedPut(page);
  await change(page);
  expect((await saved).status()).toBe(204);
  await expect(page.getByTestId('save-rejected')).toHaveCount(0);
});

/** Открыть лист поиском по делу. */
async function openBySearch(page: Page, id: string, query: string) {
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill(query);
  await page.getByTestId(`search-${id}`).locator('.search-hit').first().click();
  await expect(page.getByTestId('viewer')).toBeVisible();
}

for (const [id, query] of [
  ['37', 'Участник'],
  ['29', 'Верхний лист'],
] as const)
  test(`RV-23: таблица листа ${id} читается целиком — не шире листа`, async ({ page }) => {
    await toWall(page);
    await openBySearch(page, id, query);
    // Таблица не шире того, что её держит: строки листа или обёртки широкой таблицы.
    const fit = await page.evaluate(() => {
      const t = document.querySelector('.viewer-paper table');
      const box = t?.parentElement;
      return t && box ? { scroll: t.getBoundingClientRect().width, client: box.clientWidth } : null;
    });
    expect(fit).not.toBeNull();
    expect(fit?.scroll ?? 0).toBeLessThanOrEqual((fit?.client ?? 0) + 1);
  });
