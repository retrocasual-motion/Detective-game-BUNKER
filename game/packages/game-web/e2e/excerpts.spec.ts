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
  // Щелчок по выписке — сайт во вкладке, слова подсвечены (хеш выписки в адресе; UX-13).
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    card.locator('.excerpt-text').click(),
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
  await card.locator('.excerpt-text').click();
  await expect(page.getByTestId('computer')).toBeVisible();
  await expect(page.getByTestId('srv-log')).toBeVisible();
});

/** Выделить от слов `from` до слов `to` (могут быть в разных ячейках) и отпустить мышь. */
async function selectAcross(el: Locator, from: string, to: string) {
  await el.evaluate(
    (root, [a, b]) => {
      const find = (w: string) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const i = (n.textContent ?? '').indexOf(w);
          if (i >= 0) return { n, i };
        }
        throw new Error(`нет слов: ${w}`);
      };
      const s = find(a as string);
      const e = find(b as string);
      const r = document.createRange();
      r.setStart(s.n, s.i);
      r.setEnd(e.n, e.i + (b as string).length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      s.n.parentElement?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    [from, to],
  );
}

/** Сколько мест подсвечено (CSS Custom Highlight «case-find»). */
const lit = (page: Page) =>
  page.evaluate(
    () =>
      // Экран устройства подсвечивает своей подсветкой (RV-26), лист — своей.
      ((CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get('screen-find')
        ?.size ?? 0) +
      ((CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get('case-find')
        ?.size ?? 0),
  );

test('строка журнала через ячейки → «На стену»; по ссылке — слова подсвечены (7.4, 21.11)', async ({
  page,
}) => {
  await page.request.post('/api/dev/action-line', {
    data: { line: 'ОСМОТР | 52__конверт_прил_7_сервер.md | вставить диск в дисковод' },
  });
  await page.reload();
  await page.getByTestId('computer-monitor').click();
  await page.getByTestId('lap-icon-Сервер объекта VL-31').dblclick();
  // Время и событие строки — разные ячейки таблицы.
  const row = page
    .getByTestId('srv-log')
    .locator('tr', { hasText: 'запрос связи, маршрут 01' })
    .first();
  const time = ((await row.locator('td').first().textContent()) ?? '').trim();
  await selectAcross(row, time, 'запрос связи, маршрут 01');
  await page.getByTestId('pc-to-wall').click();
  await page.keyboard.press('Escape');
  await toWall(page);
  await page.locator('.paper-excerpt .excerpt-text').click();
  await expect(page.getByTestId('srv-log')).toBeVisible();
  await expect.poll(() => lit(page)).toBeGreaterThan(0);
});

test('выписка из «Узла связи» открывается в этом разделе программы (7.4/7.5)', async ({ page }) => {
  await page.request.post('/api/dev/action-line', {
    data: { line: 'ОСМОТР | 52__конверт_прил_7_сервер.md | вставить диск в дисковод' },
  });
  await page.reload();
  await page.getByTestId('computer-monitor').click();
  await page.getByTestId('lap-icon-Сервер объекта VL-31').dblclick();
  await page.getByTestId('srv-menu-node').click();
  const page1 = page.getByTestId('srv-page');
  const words = ((await page1.locator('p, td, li').first().textContent()) ?? '')
    .trim()
    .slice(0, 12);
  await selectAcross(page1, words, words);
  await page.getByTestId('pc-to-wall').click();
  await page.keyboard.press('Escape');
  await toWall(page);
  await page.locator('.paper-excerpt .excerpt-text').click();
  await expect(page.getByTestId('srv-menu-node')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => lit(page)).toBeGreaterThan(0);
});

test('с бумаги (CMP-C): выделить строку листа → «На стену» → полоска; щелчок — лист на этой строке', async ({
  page,
}) => {
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('845');
  await page.getByTestId('search-25').locator('.search-hit').first().click();
  const paper = page.getByTestId('viewer-paper');
  await expect(paper).toBeVisible();
  await paper.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf('845');
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 3);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      n.parentElement?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return;
    }
    throw new Error('нет 845');
  });
  await page.getByTestId('to-wall').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await toWall(page);
  const strip = page.locator('.paper-strip');
  await expect(strip).toContainText('845');
  await expect(strip.locator('.excerpt-source')).toContainText('25 · ');
  await strip.locator('.excerpt-text').click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  expect(await page.evaluate(() => CSS.highlights.get('case-find')?.size ?? 0)).toBeGreaterThan(0);
});
