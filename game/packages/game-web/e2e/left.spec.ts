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

test('компьютер следователя — монитор со значками разделов; в каждом пока «Пусто» (LEFT-B)', async ({
  page,
}) => {
  const computer = page.getByTestId('computer');
  await expect(computer.getByRole('tab')).toHaveCount(0);
  for (const name of ['Поступления', 'Почта', 'Приобщить страницу']) {
    await computer.getByTestId(`computer-tab-${name}`).click();
    await expect(computer.getByRole('dialog', { name })).toBeVisible();
    await expect(computer.getByTestId('computer-panel')).toHaveText('Пусто');
  }
  await computer.getByRole('button', { name: 'Закрыть окно' }).click();
  await expect(computer.getByRole('dialog')).toHaveCount(0);
});

test('устройства лежат на столе вещдоков рядом с монитором, у каждого бирка «Изъято»', async ({
  page,
}) => {
  const table = await page.locator('.evidence-table').boundingBox();
  for (const id of ['24', '47', '48', '49', '50']) {
    const box = await page.getByTestId(`evidence-${id}`).boundingBox();
    expect(box && table && box.y + box.height <= table.y + table.height, id).toBe(true);
    await expect(page.getByTestId(`evidence-${id}`)).toContainText(`Изъято · ${id}`);
  }
});
