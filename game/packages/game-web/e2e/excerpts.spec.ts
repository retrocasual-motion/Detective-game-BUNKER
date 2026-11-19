import type { Locator, Page } from '@playwright/test';
import { expect, test, toWall } from './fixtures.ts';

/**
 * Выписки на стену (A-272, AC-6; DB-B): выделить слова на сайте или на экране устройства →
 * «На стену» → каталожка с источником; «открыть» — источник на этом месте; снять со стены.
 */

/** Выделить слова внутри элемента и отпустить мышь — как рукой. */
async function select(el: Locator, words: string) {
  await el.evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(w);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + w.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      n.parentElement?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
    throw new Error(`нет слов: ${w}`);
  }, words);
}

async function site(page: Page, address: string): Promise<Page> {
  const r = await page.request.post('/api/site/open', { data: { address } });
  const { url } = (await r.json()) as { url: string };
  const tab = await page.context().newPage();
  await tab.goto(url);
  await expect(tab.getByTestId('site')).toBeVisible();
  return tab;
}

test('с сайта: выделить → «На стену» → в игре каталожка с источником; «открыть» — сайт на этом месте; снять', async ({
  page,
}) => {
  const vl = await site(page, 'vaultline-program.com');
  await select(vl.locator('.site-main'), 'Месяц тишины');
  await vl.getByTestId('site-to-wall').click();
  await expect(vl.getByTestId('site-pinned')).toContainText('На стене');
  // Вернулся в игру — выписка на стене.
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await toWall(page);
  const card = page.locator('.paper-excerpt');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Месяц тишины');
  await expect(card).toContainText('vaultline-program.com');
  // «открыть» — сайт в новой вкладке, слова подсвечены (хеш выписки в адресе).
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    card.locator('.excerpt-open').click(),
  ]);
  await expect(tab.getByTestId('site')).toBeVisible();
  await expect(tab).toHaveURL(/#x=/);
  // Снять выписку со стены.
  await page.bringToFront();
  await card.hover();
  await page.getByRole('button', { name: 'Снять выписку' }).click();
  await expect(page.locator('.paper-excerpt')).toHaveCount(0);
  // После перезагрузки — очередь пуста, выписка не вернулась.
  await page.reload();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await toWall(page);
  await expect(page.locator('.paper-excerpt')).toHaveCount(0);
});

test('с компьютера: строка журнала сервера → «На стену»; «открыть» — компьютер, программа', async ({
  page,
}) => {
  await page.request.post('/api/dev/action-line', {
    data: { line: 'ОСМОТР | 52__конверт_прил_7_сервер.md | вставить диск в дисковод' },
  });
  await page.reload();
  await page.getByTestId('computer-monitor').click();
  await page.getByTestId('lap-icon-Сервер объекта VL-31').dblclick();
  await select(page.getByTestId('srv-log'), 'запрос связи, маршрут 01');
  await page.getByTestId('pc-to-wall').click();
  await page.keyboard.press('Escape');
  await toWall(page);
  const card = page.locator('.paper-excerpt');
  await expect(card).toContainText('запрос связи, маршрут 01');
  await expect(card).toContainText('Сервер объекта VL-31 · Журнал событий 13.10');
  await card.locator('.excerpt-open').click();
  await expect(page.getByTestId('computer')).toBeVisible();
  await expect(page.getByTestId('srv-log')).toBeVisible();
});
