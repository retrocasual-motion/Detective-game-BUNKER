import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.getByTestId('nav-left').click();
});

test('в виде «Слева» — 5 изъятых устройств, на столе их нет', async ({ page }) => {
  const ids = await page
    .locator('[data-testid^="evidence-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids).toEqual(['evidence-24', 'evidence-47', 'evidence-48', 'evidence-49', 'evidence-50']);
  await page.getByTestId('nav-right').click();
  for (const id of ['24', '47', '48', '49', '50']) {
    await expect(page.getByTestId(`card-${id}`)).toHaveCount(0);
  }
});

test('у устройства бирка с номером и названием; клик открывает материал', async ({ page }) => {
  await expect(page.getByTestId('evidence-47')).toContainText('47');
  await expect(page.getByTestId('evidence-47')).toContainText('Ноутбук из кабинета руководителя');
  await page.getByTestId('evidence-47').click();
  await expect(page.getByTestId('viewer')).toContainText('Ноутбук из кабинета руководителя');
});

test('длинный текст радиопоста прокручивается до конца', async ({ page }) => {
  await page.getByTestId('evidence-50').click();
  const paper = page.getByTestId('viewer-paper');
  await paper.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(paper.getByText('Дальше до конца записи не размечено')).toBeInViewport();
});

test('компьютер следователя: три раздела, в каждом «Пусто»', async ({ page }) => {
  const computer = page.getByTestId('computer');
  for (const tab of ['Поступления', 'Почта', 'Приобщить страницу']) {
    await computer.getByRole('tab', { name: tab }).click();
    await expect(computer.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(computer.getByTestId('computer-panel')).toHaveText('Пусто');
  }
});
