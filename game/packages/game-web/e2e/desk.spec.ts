import type { Page } from '@playwright/test';
import { expect, takeDevice, test } from './fixtures.ts';

const DEVICES = ['24', '47', '48', '49', '50'];

/** Изъятые устройства лежат на 3D-столе (автор 24.11) — и каждое видно на экране. */
async function devicesOnScreen(page: Page) {
  const vp = page.viewportSize() ?? { width: 1366, height: 768 };
  for (const id of DEVICES)
    await expect
      .poll(async () => {
        const pt = await page.evaluate(
          (i) =>
            (
              window as unknown as {
                __desk?: { grab(id: string): { x: number; y: number } | null };
              }
            ).__desk?.grab(i) ?? null,
          id,
        );
        return !!pt && pt.x > 0 && pt.x < vp.width && pt.y > 0 && pt.y < vp.height;
      })
      .toBe(true);
}

test('на столе — изъятые устройства, все на экране', async ({ page }) => {
  await devicesOnScreen(page);
  await expect(page.getByTestId('computer-monitor')).toBeInViewport();
  // Вскрытая коробка «Личные вещи» лежит на столе открытой (BOX-B); «Входящие» — в левом углу.
  await expect(page.getByTestId('container-personal')).toHaveCount(1);
  const tray = await page.getByTestId('inbox-tray').boundingBox();
  expect((tray?.x ?? 0) + (tray?.width ?? 0) / 2).toBeLessThan(683);
});

test('щелчок по устройству — вещь в руках (этап 4a): вертеть мышью, щелчок по экрану — материал, Esc — положить', async ({
  page,
}) => {
  await takeDevice(page, '50');
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
  // С 4d радиопост — работа прямо на модели: вплотную к регистратору; Esc — снова в руках.
  await takeDevice(page, '50');
  await page.getByTestId('device-use').click();
  await expect(held).toHaveAttribute('data-focus', 'recorder');
  await page.keyboard.press('Escape');
  await expect(held).toHaveAttribute('data-focus', '');
  await expect(held).toBeVisible();
  await page.keyboard.press('Escape');
  // Камера инженера (24, A-268) — как телефон: щелчок по экрану — вплотную; Esc — снова в руках.
  await takeDevice(page, '24');
  await page.getByTestId('device-use').click();
  await expect(held).toHaveAttribute('data-focus', 'camera');
  await page.keyboard.press('Escape');
  await expect(held).toHaveAttribute('data-focus', '');
  await page.keyboard.press('Escape');
  await expect(held).toHaveCount(0);
});

test('монитор: щелчок — компьютер следователя крупно; Esc и щелчок мимо закрывают', async ({
  page,
}) => {
  await page.getByTestId('computer-monitor').click();
  const computer = page.getByTestId('computer');
  await expect(computer).toBeVisible();
  for (const s of ['Браузер']) await expect(page.getByTestId(`lap-icon-${s}`)).toBeVisible();
  // Стрелки при открытом компьютере не переключают вид.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
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
    await devicesOnScreen(page);
    await expect(page.getByTestId('computer-monitor')).toBeInViewport();
  });
}
