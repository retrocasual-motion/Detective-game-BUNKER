import { clock, parseRecord, soundStarts, windows } from '../radio/record.ts';
import type { Painter } from './texture.ts';

/**
 * Что видно на стойке радиопоста в руках (4d, A-267): экран регистратора RL-2 — время и шкала
 * отрезка с тревоги с полосами звука, как на панели лицом к игроку; шкала приёмника — три
 * диапазона, пять карандашных меток рукой Ника (две подписаны). Стрелка при изъятии — на «гражд.»
 * (Ник вернул гражданскую станцию после осмотра — 01 §7); рисуется отдельно, её крутят.
 */
export function paintRecorderScreen(body50: string, pos: number) {
  const events = parseRecord(body50);
  const win = windows()[0] ?? { from: 0, to: 1, key: '', label: '' };
  const starts = soundStarts(events);
  return ({ ctx, w, h }: Painter) => {
    ctx.fillStyle = '#0a140c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7cff8a';
    ctx.shadowColor = 'rgb(124 255 138 / 60%)';
    ctx.shadowBlur = 8;
    ctx.font = `700 ${Math.round(h * 0.3)}px "Lucida Console", monospace`;
    ctx.fillText(clock(pos), w * 0.04, h * 0.08);
    ctx.shadowBlur = 0;
    // Шкала отрезка: полосы там, где что-то слышно, и точка перемотки.
    const top = h * 0.55;
    const bh = h * 0.32;
    ctx.strokeStyle = '#1d3a22';
    ctx.strokeRect(w * 0.03, top, w * 0.94, bh);
    const x = (t: number) => w * 0.03 + ((t - win.from) / (win.to - win.from)) * w * 0.94;
    ctx.fillStyle = '#7cff8a';
    for (const s of starts)
      if (s >= win.from && s <= win.to) ctx.fillRect(x(s), top + 4, 2, bh - 8);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(x(Math.max(win.from, Math.min(win.to, pos))) - 1, top - 4, 3, bh + 8);
  };
}

/** Шкала приёмника: СВ / УКВ / КВ, карандашные метки, стрелка. */
export function paintReceiverDial() {
  return ({ ctx, w, h }: Painter) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#efe6c8');
    g.addColorStop(1, '#d9cfae');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rows = [
      { band: 'СВ', from: 530, to: 1600, unit: 'кГц' },
      { band: 'УКВ', from: 88, to: 108, unit: 'МГц' },
      { band: 'КВ', from: 3, to: 22, unit: 'МГц' },
    ];
    const rowH = h / 3;
    ctx.textBaseline = 'middle';
    rows.forEach((r, i) => {
      const y = rowH * i + rowH * 0.55;
      ctx.strokeStyle = '#3a3528';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, y);
      ctx.lineTo(w * 0.96, y);
      ctx.stroke();
      ctx.fillStyle = '#2a2620';
      ctx.font = `700 ${Math.round(rowH * 0.3)}px Tahoma, sans-serif`;
      ctx.fillText(r.band, w * 0.015, y);
      ctx.font = `${Math.round(rowH * 0.22)}px Tahoma, sans-serif`;
      for (let k = 0; k <= 6; k++) {
        const xx = w * 0.1 + (k / 6) * w * 0.86;
        ctx.beginPath();
        ctx.moveTo(xx, y - rowH * 0.12);
        ctx.lineTo(xx, y + rowH * 0.12);
        ctx.stroke();
        const v = r.from + ((r.to - r.from) * k) / 6;
        ctx.fillText(String(Math.round(v)), xx - rowH * 0.12, y - rowH * 0.3);
      }
    });
    // Карандашные метки (канон: «гражд.», «округ» и три без подписи в КВ).
    const pencil = (x: number, row: number, label?: string) => {
      const y = rowH * row + rowH * 0.55;
      ctx.strokeStyle = 'rgb(70 70 80 / 80%)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * x, y + rowH * 0.05);
      ctx.lineTo(w * x + 2, y + rowH * 0.3);
      ctx.stroke();
      if (label) {
        ctx.fillStyle = 'rgb(60 60 70 / 85%)';
        ctx.font = `italic ${Math.round(rowH * 0.24)}px "Segoe Print", "Comic Sans MS", cursive`;
        ctx.fillText(label, w * x - rowH * 0.25, y + rowH * 0.38);
      }
    };
    pencil(0.38, 0, 'гражд.');
    pencil(0.66, 1, 'округ');
    pencil(0.27, 2);
    pencil(0.49, 2);
    pencil(0.74, 2);
    // Стрелка — отдельной риской поверх шкалы (её ведёт ручка настройки, radioStand.tsx).
  };
}
