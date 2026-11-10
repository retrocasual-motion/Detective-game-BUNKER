import type { Painter } from './texture.ts';

/**
 * Что горит на экране ноутбука, пока его вертят в руках (правка автора 10.11): экран уже включён —
 * экран входа (a.cole, сетка 3×3, «Нарисуйте ключ»); после первого входа — экран приветствия
 * (профиль, a.cole, «Войти»). Тот же вид, что на живом экране, — щелчок по нему продолжает.
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
    // Ключ уже введён: экран приветствия — профиль, a.cole и «Войти» (правка автора 10.11).
    const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.7);
    g.addColorStop(0, '#1b2b45');
    g.addColorStop(1, '#070c16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = h * 0.11;
    const cx = w / 2;
    const cy = h * 0.36;
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
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dfe6ef';
    text('a.cole', cx, cy + r * 1.3, w, `${Math.round(h * 0.04)}px Tahoma, sans-serif`, h * 0.05);
    // Кнопка «Войти».
    const bw = w * 0.14;
    const bh = h * 0.07;
    ctx.fillStyle = '#2a62b6';
    ctx.fillRect(cx - bw / 2, h * 0.6, bw, bh);
    ctx.fillStyle = '#fff';
    text(
      'Войти',
      cx,
      h * 0.6 + bh * 0.18,
      w,
      `700 ${Math.round(h * 0.035)}px Tahoma, sans-serif`,
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
  };
}
