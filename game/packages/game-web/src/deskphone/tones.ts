/**
 * Звуки телефона на столе (6a-3) — Web Audio, без файлов. Частоты — североамериканские (бюро в
 * США; Precise Tone Plan): гудок 350+440 Гц непрерывно, вызов 440+480 Гц (2 с звук / 4 с
 * тишина), «занято» 480+620 Гц (0,5 / 0,5). Кнопки — DTMF: строка 697/770/852/941 Гц, столбец
 * 1209/1336/1477 Гц.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx ??= new Ctx();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** Пара частот на время `ms` (от `at` с), тихо. */
function pair(a: AudioContext, f1: number, f2: number, at: number, ms: number, out: GainNode) {
  for (const f of [f1, f2]) {
    const o = a.createOscillator();
    o.frequency.value = f;
    o.connect(out);
    o.start(at);
    o.stop(at + ms / 1000);
  }
}

const ROW: Record<string, number> = { '1': 697, '2': 697, '3': 697, '4': 770, '5': 770 };
Object.assign(ROW, { '6': 770, '7': 852, '8': 852, '9': 852, '*': 941, '0': 941, '#': 941 });
const COL: Record<string, number> = { '1': 1209, '4': 1209, '7': 1209, '*': 1209 };
Object.assign(COL, { '2': 1336, '5': 1336, '8': 1336, '0': 1336 });
Object.assign(COL, { '3': 1477, '6': 1477, '9': 1477, '#': 1477 });

/** Тон кнопки. */
export function dtmf(key: string): void {
  const a = audio();
  const r = ROW[key];
  const c = COL[key];
  if (!a || !r || !c) return;
  const g = a.createGain();
  g.gain.value = 0.04;
  g.connect(a.destination);
  pair(a, r, c, a.currentTime, 140, g);
  setTimeout(() => g.disconnect(), 400);
}

/** `bell` — звонок самого телефона на столе (входящий, SD5-A). */
export type ToneKind = 'dial' | 'ring' | 'busy' | 'bell';

/** Тон линии до отмены: гудок, вызов, «занято». Возвращает «выключить». */
export function startTone(kind: ToneKind): () => void {
  const a = audio();
  if (!a) return () => undefined;
  const level = kind === 'busy' ? 0.03 : kind === 'bell' ? 0.05 : 0.035;
  const g = a.createGain();
  g.connect(a.destination);
  const [f1, f2, on, off] =
    kind === 'dial'
      ? [350, 440, 60_000, 0]
      : kind === 'ring'
        ? [440, 480, 2000, 4000]
        : kind === 'bell'
          ? // Электронный звонок офисного аппарата: две ноты, полторы секунды, пауза.
            [700, 940, 1500, 2500]
          : [480, 620, 500, 500];
  // Два непрерывных генератора; гудки и паузы — громкостью (F10: не сотни генераторов вперёд).
  const t0 = a.currentTime;
  const end = t0 + 60;
  const oscs = [f1, f2].map((f) => {
    const o = a.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start(t0);
    o.stop(end);
    return o;
  });
  g.gain.setValueAtTime(0, t0);
  for (let t = t0; t < end; t += (on + off) / 1000) {
    g.gain.setValueAtTime(level, t);
    if (off) g.gain.setValueAtTime(0, t + on / 1000);
  }
  return () => {
    g.gain.cancelScheduledValues(a.currentTime);
    g.gain.setValueAtTime(0, a.currentTime);
    for (const o of oscs) {
      try {
        o.stop();
      } catch {
        // уже остановлен
      }
    }
    setTimeout(() => g.disconnect(), 100);
  };
}
