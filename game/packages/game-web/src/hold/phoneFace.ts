import { lockContent } from '../phone/content.ts';
import type { Painter } from './texture.ts';

/**
 * Что горит на экране телефона, пока его вертят в руках: экран блокировки, как на живом экране —
 * обои (жёлтая стена, L949), часы (время игрока, CL-D), уведомления из 48; внизу — «Enter passcode» или, когда код уже
 * введён, «slide to unlock» (PN-A).
 */
export function paintPhoneFace(unlocked: boolean, body48: string, time: string) {
  const notes = lockContent(body48).notifications;
  return ({ ctx, w, h, text }: Painter) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d9b23c');
    g.addColorStop(1, '#a9842a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Силуэт на обоях — фото придёт на этапе изготовления.
    ctx.fillStyle = 'rgb(60 40 20 / 35%)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.42, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.28, h * 0.5, w * 0.44, h * 0.3);
    ctx.fillStyle = 'rgb(0 0 0 / 45%)';
    ctx.fillRect(0, 0, w, h * 0.2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    text(
      time,
      w / 2,
      h * 0.03,
      w,
      `300 ${Math.round(h * 0.08)}px Helvetica, Arial, sans-serif`,
      h * 0.09,
    );
    let y = h * 0.24;
    for (const n of notes) {
      ctx.fillStyle = 'rgb(0 0 0 / 55%)';
      ctx.fillRect(w * 0.06, y, w * 0.88, h * 0.07);
      ctx.fillStyle = '#fff';
      text(
        n.title,
        w / 2,
        y + h * 0.015,
        w * 0.84,
        `600 ${Math.round(h * 0.026)}px Helvetica, Arial, sans-serif`,
        h * 0.03,
      );
      y += h * 0.085;
    }
    ctx.fillStyle = 'rgb(0 0 0 / 60%)';
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = '#e8e8e8';
    text(
      unlocked ? 'slide to unlock' : 'Enter passcode',
      w / 2,
      h * 0.9,
      w,
      `${Math.round(h * 0.032)}px Helvetica, Arial, sans-serif`,
      h * 0.04,
    );
    ctx.textAlign = 'start';
  };
}
