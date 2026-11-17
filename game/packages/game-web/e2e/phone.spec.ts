import type { Page } from '@playwright/test';
import { expect, sheet, test } from './fixtures.ts';

/**
 * Телефон Габриэля (этап 4c-2; решения автора 11.11 — PH-A, PN-A, CALL-A, EM-A; SCR-C, LK-A,
 * DV-A): экраном к игроку, код, домашний экран, приложения; файлы остаются на телефоне.
 */

async function phoneUp(page: Page) {
  await page.getByTestId('device-48').click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Телефон/);
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('phone-view')).toBeVisible();
}

async function typeCode(page: Page, code: string) {
  for (const d of code) await page.getByTestId(`phone-key-${d}`).click();
}

test('экран блокировки — по канону: уведомления, «Enter passcode», неверный код — ничего не стирается', async ({
  page,
}) => {
  await phoneUp(page);
  const notes = page.getByTestId('phone-notifications');
  await expect(notes).toContainText('Ana — 41 missed calls');
  await expect(notes).toContainText('13.10.2009, 22:10');
  await expect(notes).toContainText('Voicemail — 3 new');
  await expect(page.getByTestId('phone-pass-msg')).toHaveText('Enter passcode');
  await typeCode(page, '1234');
  await expect(page.getByTestId('phone-pass-msg')).toHaveText('Wrong passcode');
  await expect(page.getByTestId('phone-pass-msg')).toHaveText('Enter passcode');
  // Отвёл взгляд — телефон снова в руках.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('phone-view')).toHaveCount(0);
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Телефон/);
});

test('пять неверных кодов — «Try again in 2:00» (LK-A)', async ({ page }) => {
  await phoneUp(page);
  for (let k = 0; k < 5; k++) {
    await typeCode(page, '1111');
    // Дождаться ответа на эту попытку, потом — следующая.
    await expect(page.getByTestId('phone-pass-msg')).toHaveText(/Wrong passcode|Try again/);
    await expect(page.getByTestId('phone-pass-msg')).not.toHaveText('Wrong passcode');
  }
  await expect(page.getByTestId('phone-pass-msg')).toContainText('Try again in 1:5');
});

test('код с клавиатуры — домашний экран; дальше — «slide to unlock», без кода (PN-A)', async ({
  page,
}) => {
  await phoneUp(page);
  for (const d of '0110') await page.keyboard.press(d);
  await expect(page.getByTestId('phone-home')).toBeVisible();
  for (const app of ['Phone', 'Messages', 'Contacts'])
    await expect(page.getByTestId(`phone-app-${app}`)).toBeVisible();
  await expect(page.getByTestId('phone-clock')).toContainText(':');
  // Файлы телефона — на телефоне: на стене и во «Входящих» их нет (DV-A).
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'L540')).toHaveCount(0);
  await expect(page.getByTestId('inbox-L540')).toHaveCount(0);
  await phoneUp(page);
  await expect(page.getByTestId('phone-passcode')).toHaveCount(0);
  const knob = page.getByTestId('phone-slide-knob');
  const k = await knob.boundingBox();
  const track = await page.getByTestId('phone-slide').boundingBox();
  if (!k || !track) throw new Error('нет ползунка');
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.mouse.move(k.x + 40, k.y + k.height / 2, { steps: 4 });
  await page.mouse.up();
  // Не дотянул — ползунок вернулся, телефон заперт.
  await expect(page.getByTestId('phone-home')).toHaveCount(0);
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width, k.y + k.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('phone-home')).toBeVisible();
});

test('приложения: переписка с голосовым, контакт без кнопки вызова, вкладки «Phone»; экран сохраняется', async ({
  page,
}) => {
  await phoneUp(page);
  await typeCode(page, '0110');
  await page.getByTestId('phone-app-Messages').click();
  await page.getByTestId('phone-thread-Ana').click();
  const thread = page.getByTestId('phone-thread');
  await expect(thread).toContainText('Gabi, contesta por favor');
  await page.getByTestId('phone-voice').click();
  await expect(thread).toContainText('он не понимает');
  await page.getByTestId('phone-back').click();
  await page.getByTestId('phone-back').click();
  await page.getByTestId('phone-app-Contacts').click();
  await page.getByTestId('phone-contact-Ana').click();
  const card = page.getByTestId('phone-contact-card');
  await expect(card).toContainText('+7 926 555-30-14');
  await expect(card).toContainText('hermana');
  // CALL-A: звонить с изъятого телефона нельзя.
  await expect(card.getByRole('button')).toHaveCount(0);
  await page.getByTestId('phone-home-btn').click();
  await page.getByTestId('phone-app-Phone').click();
  await expect(page.getByTestId('phone-recents')).toContainText('13.10, 22:10');
  await page.getByTestId('phone-tab-voicemail').click();
  await page.getByTestId('phone-vm-2').click();
  await expect(page.getByTestId('phone-voicemail')).toContainText('Mañana es el catorce');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  await phoneUp(page);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('phone-screen-voicemail')).toBeVisible();
});

test('выделил номер — «В запрос»: карточка из телефона; папка поверх телефона', async ({
  page,
}) => {
  await phoneUp(page);
  await typeCode(page, '0110');
  await page.getByTestId('phone-app-Contacts').click();
  await page.getByTestId('phone-contact-Clínica San Rafael').click();
  const card = page.getByTestId('phone-contact-card');
  await card.evaluate((el) => {
    const word = '+7 926 555-01-90';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(word);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + word.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      return;
    }
  });
  const box = await card.boundingBox();
  if (!box) throw new Error('нет карточки');
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.up();
  await page.getByTestId('phone-to-petition').click();
  await expect(page.getByTestId('phone-view')).toBeVisible();
  await expect(page.getByTestId('petition-card').first()).toContainText('+7 926 555-01-90');
});

test('вплотную — та же вещь (WM-B): щелчок мимо телефона — снова в руках; кнопка «домой» — на корпусе', async ({
  page,
}) => {
  await phoneUp(page);
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('data-focus', 'phone');
  await expect(page.getByTestId('phone-home-btn')).toBeVisible();
  await page.mouse.click(150, 400);
  await expect(held).toHaveAttribute('data-focus', '');
  await expect(page.getByTestId('phone-view')).toHaveCount(0);
  await expect(held).toBeVisible();
});
