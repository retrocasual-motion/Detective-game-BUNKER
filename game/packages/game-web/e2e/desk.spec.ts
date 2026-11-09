import { expect, test } from './fixtures.ts';

const DEVICES = ['24', '47', '48', '49', '50'];

test('на столе — изъятые устройства с бирками «Изъято», все на экране', async ({ page }) => {
  for (const id of DEVICES) {
    const d = page.getByTestId(`device-${id}`);
    await expect(d).toBeInViewport();
    await expect(d).toContainText(`Изъято · ${id}`);
  }
  await expect(page.getByTestId('computer-monitor')).toBeInViewport();
  // Коробка с пакетами вещдоков подписана; «Входящие» — справа, у лампы.
  await expect(page.getByTestId('bags-box')).toHaveText('Личные вещи · 40–46');
  const tray = await page.getByTestId('inbox-tray').boundingBox();
  expect((tray?.x ?? 0) + (tray?.width ?? 0) / 2).toBeGreaterThan(683);
});

test('щелчок по устройству — вещь в руках (этап 4a): вертеть мышью, щелчок по экрану — материал, Esc — положить', async ({
  page,
}) => {
  await page.getByTestId('device-50').click();
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('aria-label', /Радиопост/);
  // Протянуть — вещь вращается и остаётся в руках (это не щелчок мимо).
  await page.mouse.move(683, 300);
  await page.mouse.down();
  await page.mouse.move(800, 340, { steps: 8 });
  await page.mouse.up();
  await expect(held).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();
  await page.getByTestId('device-50').click();
  await page.getByTestId('device-use').click();
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toContainText('Радиопост');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('монитор: щелчок — экран крупно, значки разделов, «Пусто»; ✕, Esc и щелчок мимо закрывают', async ({
  page,
}) => {
  await page.getByTestId('computer-monitor').click();
  const computer = page.getByTestId('computer');
  await expect(computer).toBeVisible();
  for (const s of ['Поступления', 'Почта', 'Приобщить страницу']) {
    await expect(page.getByTestId(`computer-tab-${s}`)).toBeVisible();
  }
  await page.getByTestId('computer-tab-Почта').click();
  await expect(page.getByTestId('computer-panel')).toHaveText('Пусто');
  // Стрелки при открытом компьютере не переключают вид.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  await page.getByTestId('computer-close').click();
  await expect(computer).toBeHidden();

  await page.getByTestId('computer-monitor').click();
  await page.keyboard.press('Escape');
  await expect(computer).toBeHidden();

  await page.getByTestId('computer-monitor').click();
  await page.mouse.click(20, 20);
  await expect(computer).toBeHidden();
});

for (const vp of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 1024 },
]) {
  test(`${vp.width}×${vp.height}: устройства и монитор на экране`, async ({ page }) => {
    await page.setViewportSize(vp);
    for (const id of DEVICES) await expect(page.getByTestId(`device-${id}`)).toBeInViewport();
    await expect(page.getByTestId('computer-monitor')).toBeInViewport();
  });
}
