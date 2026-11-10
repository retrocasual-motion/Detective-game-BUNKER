import type { Painter } from './texture.ts';

/**
 * Что горит на экране ноутбука, пока его вертят в руках (правка автора 10.11): экран уже включён —
 * экран входа (a.cole, сетка 3×3, «Нарисуйте ключ»); после входа — рабочий стол со знаком
 * VAULTLINE и панелью задач. Тот же вид, что на живом экране, — щелчок по нему продолжает.
 */
export function paintLaptopFace(unlocked: boolean) {
  return ({ ctx, w, h, text }: Painter) => {
    if (!unlocked) {
      const g = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, w * 0.7);
      g.addColorStop(0, '#1b2b45');
      g.addColorStop(1, '#070c16');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Аватар: круг, в нём — угол знака.
      const r = h * 0.045;
      const cx = w / 2;
      const cy = h * 0.2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0d1522';
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = '#d9e2ee';
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.2, cy - r * 0.25);
      ctx.lineTo(cx + r * 0.25, cy - r * 0.25);
      ctx.lineTo(cx + r * 0.25, cy + r * 1.2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#8fa3bd';
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#dfe6ef';
      ctx.textAlign = 'center';
      text(
        'a.cole',
        cx,
        cy + r * 1.5,
        w,
        `${Math.round(h * 0.035)}px Tahoma, sans-serif`,
        h * 0.04,
      );
      // Сетка 3×3.
      const step = h * 0.12;
      for (let i = 0; i < 9; i++) {
        const x = cx + ((i % 3) - 1) * step;
        const y = h * 0.47 + (Math.floor(i / 3) - 1) * step;
        ctx.beginPath();
        ctx.arc(x, y, h * 0.011, 0, Math.PI * 2);
        ctx.fillStyle = '#c9d3df';
        ctx.fill();
      }
      text(
        'Нарисуйте ключ',
        cx,
        h * 0.66,
        w,
        `${Math.round(h * 0.03)}px Tahoma, sans-serif`,
        h * 0.04,
      );
      ctx.fillStyle = '#8b97a8';
      text(
        'VAULTLINE · рабочее место руководителя программы',
        cx,
        h * 0.92,
        w,
        `${Math.round(h * 0.022)}px Tahoma, sans-serif`,
        h * 0.03,
      );
      ctx.textAlign = 'start';
      return;
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#23476e');
    g.addColorStop(0.6, '#0f2440');
    g.addColorStop(1, '#0a1a30');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Знак VAULTLINE: арка и три полосы.
    const s = h * 0.28;
    const ax = w / 2 - s / 2;
    const ay = h * 0.24;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(ax, ay + s);
    ctx.lineTo(ax, ay + s * 0.42);
    ctx.arc(ax + s / 2, ay + s * 0.42, s / 2, Math.PI, 0);
    ctx.lineTo(ax + s, ay + s);
    ctx.stroke();
    for (const k of [0.38, 0.58, 0.78]) ctx.fillRect(ax, ay + s * k, s, s * 0.08);
    ctx.restore();
    // Значки слева столбцом и панель задач.
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#e8edf3' : '#e5b546';
      ctx.fillRect(w * 0.02, h * (0.04 + i * 0.12), h * 0.06, h * 0.05);
    }
    ctx.fillStyle = '#1f3d6b';
    ctx.fillRect(0, h * 0.94, w, h * 0.06);
    ctx.fillStyle = '#3e7a4e';
    ctx.fillRect(0, h * 0.94, w * 0.08, h * 0.06);
  };
}
