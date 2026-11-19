import { useEffect, useState } from 'react';
import { reducedMotion } from '../motion.ts';
import { useGame } from '../store.ts';

/**
 * Системный блок с дисководом (A-272, AC-2; лоток CD/DVD, 2009 год): справа от монитора. Диск
 * вставили — лоток выезжает, диск ложится, лоток уезжает, раскрутка (звук), индикатор мигает;
 * потом на рабочем столе — значок программы. Диск остаётся в компьютере.
 */

export type TrayState = 'closed' | 'open' | 'loaded' | 'closing' | 'spin';

/** Шаги вставки и их длительность, мс (с «уменьшить движение» — мгновенно). */
const STEPS: [TrayState, number][] = [
  ['open', 750],
  ['loaded', 550],
  ['closing', 750],
  ['spin', 1500],
];

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

export function DiscDrive({ hasDisc }: { hasDisc: boolean }) {
  const inserting = useGame((g) => g.discInserting);
  const [tray, setTray] = useState<TrayState>('closed');

  useEffect(() => {
    if (!inserting) return;
    const fast = reducedMotion();
    let at = 0;
    const timers = STEPS.map(([state, ms]) => {
      const t = setTimeout(() => {
        setTray(state);
        if (state === 'spin') spinUpSound(fast ? 600 : ms);
      }, at);
      at += fast ? 60 : ms;
      return t;
    });
    timers.push(
      setTimeout(() => {
        setTray('closed');
        useGame.getState().discInserted();
      }, at),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [inserting]);

  return (
    <div className="pc-tower" data-testid="pc-tower" aria-hidden>
      <div className="pc-bay">
        <div className="pc-tray" data-testid="pc-tray" data-state={tray}>
          <div className="pc-tray-disc" />
        </div>
        <span
          className={`pc-drive-led${tray === 'spin' ? ' pc-drive-led-on' : ''}`}
          data-disc={hasDisc}
        />
      </div>
      <div className="pc-bay pc-bay-blank" />
      <div className="pc-tower-power" />
      <div className="pc-tower-vents" />
    </div>
  );
}
