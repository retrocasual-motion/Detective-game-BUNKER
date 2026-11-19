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

export type ToneKind = 'dial' | 'ring' | 'busy';

/** Тон линии до отмены: гудок, вызов, «занято». Возвращает «выключить». */
export function startTone(kind: ToneKind): () => void {
  const a = audio();
  if (!a) return () => undefined;
  const g = a.createGain();
  g.gain.value = kind === 'busy' ? 0.03 : 0.035;
  g.connect(a.destination);
  const [f1, f2, on, off] =
    kind === 'dial'
      ? [350, 440, 60_000, 0]
      : kind === 'ring'
        ? [440, 480, 2000, 4000]
        : [480, 620, 500, 500];
  let t = a.currentTime;
  // Расписание вперёд на минуту — дольше тон не звучит (гудок висит, пока не начнут набор).
  while (t < a.currentTime + 60) {
    pair(a, f1, f2, t, on, g);
    t += (on + off) / 1000;
  }
  return () => {
    g.gain.cancelScheduledValues(a.currentTime);
    g.gain.setValueAtTime(0, a.currentTime);
    setTimeout(() => g.disconnect(), 100);
  };
}
