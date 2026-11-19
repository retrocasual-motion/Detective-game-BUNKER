import { useEffect, useState } from 'react';
import { postAction } from '../api.ts';
import { reducedMotion } from '../motion.ts';
import { useGame } from '../store.ts';

/**
 * Дисковод под монитором (A-272, AC-2; автор 19.11: «чисто дисковод под монитором, блок под
 * столом»): диск дотащили до него на столе (DD-A) — движок (ОСМОТР 52 — вставить диск в
 * дисковод), затем на столе: лоток выезжает, диск ложится, лоток уезжает, огонёк мигает,
 * раскрутка; потом — компьютер со значком программы.
 */

/** Вид дисковода на столе: насколько выехал лоток (0…1), лежит ли на нём диск, горит ли огонёк. */
export interface DriveLook {
  out: number;
  disc: boolean;
  led: boolean;
}
export const DRIVE_IDLE: DriveLook = { out: 0, disc: false, led: false };

/** Цель действия — как в сквозном проходе пакета. */
const TARGET = '52__конверт_прил_7_сервер.md';

/** Вставить диск (движок); не вышло (нет связи) — false, диск остаётся на столе. */
export async function insertServerDisc(): Promise<boolean> {
  const r = await postAction('ОСМОТР', TARGET, 'вставить диск в дисковод').catch(() => null);
  if (!r) return false;
  const g = useGame.getState();
  g.insertDisc();
  if (r.released.length) g.addFound(r.released, 'pc', []);
  return true;
}

/** Шаги вставки, мс от начала: выезд, диск, заезд, раскрутка, конец. */
const T = { open: 700, drop: 900, close: 1650, spin: 3150 };

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** Кадры вставки для стола; пока вставки нет — дисковод в покое. */
export function useDriveAnimation(): DriveLook {
  const inserting = useGame((g) => g.discInserting);
  const [look, setLook] = useState<DriveLook>(DRIVE_IDLE);
  useEffect(() => {
    if (!inserting) {
      setLook(DRIVE_IDLE);
      return;
    }
    const k = reducedMotion() ? 0.15 : 1;
    const start = performance.now();
    let raf = 0;
    let sound = false;
    const frame = (now: number) => {
      const t = (now - start) / k;
      if (t >= T.close && !sound) {
        sound = true;
        spinUpSound(reducedMotion() ? 500 : T.spin - T.close);
      }
      if (t >= T.spin) {
        setLook(DRIVE_IDLE);
        useGame.getState().discInserted();
        return;
      }
      const out =
        t < T.open
          ? ease(t / T.open)
          : t < T.drop
            ? 1
            : 1 - ease((t - T.drop) / (T.close - T.drop));
      const disc = t >= T.open * 0.85;
      const led = t >= T.close && Math.floor(t / 120) % 2 === 0;
      setLook({ out, disc, led });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [inserting]);
  return look;
}

/** Раскрутка диска: шум и тон, нарастают и стихают (Web Audio, без файлов). */
export function spinUpSound(ms = 1500) {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return;
  }
  const t = ctx.currentTime;
  const end = t + ms / 1000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.06, t + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(ctx.destination);
  // Мотор: тон растёт.
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(60, t);
  osc.frequency.exponentialRampToValueAtTime(320, end);
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 900;
  osc.connect(low).connect(gain);
  // Шорох диска.
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (ms / 1000)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400;
  noise.connect(band).connect(gain);
  osc.start(t);
  noise.start(t);
  osc.stop(end);
  noise.stop(end);
  setTimeout(() => void ctx.close().catch(() => undefined), ms + 300);
}
