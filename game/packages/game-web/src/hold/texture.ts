import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/**
 * Надписи на гранях вещи (этап 4a): рисуются в текстуру — чёткие (2048 px по ширине грани),
 * с кириллицей, прячутся за самой вещью, как настоящая краска на бумаге. Живой текст для
 * выделения — у листов (4b), когда лист лежит к игроку лицом.
 */

export interface Painter {
  ctx: CanvasRenderingContext2D;
  /** Ширина и высота холста, px. */
  w: number;
  h: number;
  /** Строки с переносом по словам; возвращает y под последней строкой. */
  text(s: string, x: number, y: number, maxW: number, font: string, lineH: number): number;
}

const PX_PER_UNIT = 680;

export function paintTexture(
  wUnits: number,
  hUnits: number,
  background: string | null,
  paint: (p: Painter) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  const w = Math.round(wUnits * PX_PER_UNIT);
  const h = Math.round(hUnits * PX_PER_UNIT);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.textBaseline = 'top';
    const text: Painter['text'] = (s, x, y, maxW, font, lineH) => {
      ctx.font = font;
      let line = '';
      let yy = y;
      for (const word of s.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxW && line) {
          ctx.fillText(line, x, yy);
          line = word;
          yy += lineH;
        } else line = next;
      }
      if (line) ctx.fillText(line, x, yy);
      return yy + lineH;
    };
    paint({ ctx, w, h, text });
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearFilter;
  return tex;
}
