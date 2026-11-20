import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * Телефон следователя на столе (6a-3, PH-B): подойти, набрать номер кнопками, снять трубку —
 * линия по правилам ЗВОНОК пакета (меню и цифры, автоответчик, «не обслуживается»); положить
 * трубку — отбой. Тексты линий — только с сервера.
 */

async function phoneUp(page: Page) {
  await page.getByTestId('desk-phone').click();
  // Камера у телефона на столе (DP-A): кнопки — прямо на нём.
  await expect(page.getByTestId('scene')).toHaveAttribute('data-spot', 'phone');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-moving', 'false');
}

async function dial(page: Page, digits: string) {
  for (const d of digits) await page.getByTestId(`dp-key-${d}`).click();
}

const heard = (page: Page) => page.getByTestId('dp-heard');

test('набрать номер, снять трубку: меню NorthCare → номер партии → ответ; положить трубку', async ({
  page,
}) => {
  await phoneUp(page);
  await dial(page, '88005553120');
  await expect(page.getByTestId('dp-number')).toHaveText('88005553120');
  // «Стереть» убирает последнюю цифру.
  await page.getByTestId('dp-erase').click();
  await expect(page.getByTestId('dp-number')).toHaveText('8800555312');
  await dial(page, '0');
  await page.getByTestId('dp-handset').click();
  await expect(heard(page)).toContainText('введите номер партии');
  await expect(page.getByTestId('dp-lcd')).toContainText('Соединено');
  await dial(page, '0418');
  await expect(heard(page)).toContainText('Партия 0418');
  await dial(page, '0417');
  await expect(heard(page)).toContainText('Партия 0417 в реестре не зарегистрирована');
  // Положили трубку — отбой: экранчик снова ждёт номер, слышанное остаётся прочитать.
  await page.getByTestId('dp-handset').click();
  await expect(page.getByTestId('dp-lcd')).toContainText('Наберите номер');
  await expect(heard(page)).toContainText('Было слышно');
});

test('снять трубку — гудок; набор с клавиатуры — пошёл сам; автоответчик цифры не ждёт', async ({
  page,
}) => {
  await phoneUp(page);
  await page.getByTestId('dp-handset').click();
  await expect(page.getByTestId('dp-lcd')).toContainText('Гудок');
  await page.keyboard.type('89165552408');
  await expect(heard(page)).toContainText('Привет, вы позвонили Тому и Лее');
  await dial(page, '1');
  await expect(heard(page)).not.toContainText('Набрано');
  // Enter — положить трубку; Esc — отойти от телефона.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dp-lcd')).toContainText('Наберите номер');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-spot', 'desk');
  await expect(heard(page)).toHaveCount(0);
});

test('чужой номер — «не обслуживается»; «Повтор» — последний номер на экранчик, трубка — звонок', async ({
  page,
}) => {
  await phoneUp(page);
  await dial(page, '84951234567');
  await page.getByTestId('dp-handset').click();
  await expect(heard(page)).toContainText('Номер не обслуживается');
  await page.getByTestId('dp-handset').click();
  await expect(page.getByTestId('dp-number')).toHaveText('—');
  await page.getByTestId('dp-redial').click();
  await expect(page.getByTestId('dp-number')).toHaveText('84951234567');
  await page.getByTestId('dp-handset').click();
  await expect(heard(page)).toContainText('Номер не обслуживается');
  // Щелчок по столу вокруг телефона — отойти (и отбой).
  await page.getByTestId('deskphone-close').click({ position: { x: 10, y: 300 } });
  await expect(page.getByTestId('scene')).toHaveAttribute('data-spot', 'desk');
});

test('у телефона: стрелка «Стол» назад; щелчок по корпусу ничего не сбрасывает; подсказка — до первого нажатия (UX-1, 2, 12)', async ({
  page,
}) => {
  await phoneUp(page);
  await expect(page.locator('.dp-hint')).toBeVisible();
  await dial(page, '8');
  await expect(page.locator('.dp-hint')).toHaveCount(0);
  await page.getByTestId('dp-handset').click();
  await expect(page.getByTestId('dp-lcd')).toContainText('Гудок');
  // Корпус между кнопками и трубкой — «немой»: трубка снята, камера у телефона.
  const body = await page.getByTestId('dp-body').boundingBox();
  if (!body) throw new Error('нет корпуса');
  await page.mouse.click(body.x + body.width * 0.42, body.y + body.height * 0.7);
  await expect(page.getByTestId('scene')).toHaveAttribute('data-spot', 'phone');
  await expect(page.getByTestId('dp-handset')).toHaveAttribute('aria-pressed', 'true');
  // Стрелка «Стол» внизу — отойти (и отбой).
  await page.getByTestId('nav-phone-back').click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-spot', 'desk');
});

test('короткий номер — после паузы линия отвечает, а не тишина (UX-5)', async ({ page }) => {
  await phoneUp(page);
  await page.getByTestId('dp-handset').click();
  await dial(page, '911');
  await expect(heard(page)).toContainText('Номер не обслуживается', { timeout: 6000 });
});

test('все линии пакета отвечают по своим номерам (TECH_PLAN 4.14)', async ({ page }) => {
  const lines: [string, string, boolean][] = [
    ['+7 800 555-31-20', 'NorthCare', true],
    ['+7 495 555-18-44', 'Colton Supply', true],
    ['+7 916 555-24-08', 'Тому и Лее', false],
    ['+7 926 555-30-14', 'Hola, soy Ana', false],
    ['+7 926 555-47-12', 'Миллерам', false],
    ['+7 800 555-84-50', 'Front Range Savings', false],
    ['+7 926 555-01-90', 'Clínica San Rafael', false],
  ];
  for (const [number, text, menu] of lines) {
    const r = await page.request.post('/api/phone', { data: { number } });
    const body = (await r.json()) as { connected: boolean; text: string; menu: boolean };
    expect(body, number).toMatchObject({ connected: true, menu });
    expect(body.text, number).toContain(text);
  }
  const colton = await page.request.post('/api/phone', {
    data: { number: '84955551844', keys: '2291' },
  });
  expect(((await colton.json()) as { text: string }).text).toContain(
    'Возвращено на склад 26.10.2009',
  );
});

test('у телефона: печать в поиске — не телефону; поиск уводит от телефона — отбой (F7)', async ({
  page,
}) => {
  await phoneUp(page);
  await page.getByTestId('dp-handset').click();
  await expect(page.getByTestId('dp-lcd')).toContainText('Гудок');
  // Поиск у телефона — Ctrl+F (вкладка «Поиск» спрятана, как у всех вещей вблизи).
  await page.keyboard.press('Control+f');
  await expect(page.getByTestId('search-input')).toBeFocused();
  await page.keyboard.type('555');
  await expect(page.getByTestId('search-input')).toHaveValue('555');
  // Поиск открыт — телефон оставлен: трубка положена, камера у стола.
  await expect(page.getByTestId('scene')).toHaveAttribute('data-spot', 'desk');
  await expect(page.getByTestId('dp-number')).toHaveText('—');
});
