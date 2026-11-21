import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Group, Mesh } from 'three';
import { create } from 'zustand';
import { reducedMotion } from '../motion.ts';
import { NO_LINKS } from '../paperLinks.tsx';
import { type Media, mmss, parseMedia, rowAt } from '../player/media.ts';
import { useGame } from '../store.ts';
import { SETTLED, useAnimate } from './animate.ts';
import Held3D, { type Focus } from './Held3D.tsx';
import { Tag, useActive, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Проигрыватель микрокассет бюро с кассетой «06.10.08» (A-272, AC-4; L462): из коробки банка.
 * Ручная проверка автора 21.11 (6.4/6.5): кассета уже в проигрывателе; в руках его вертят, щелчок
 * по нему — проигрыватель встаёт лицом, камера подъезжает, и работают кнопки на корпусе, как у
 * настоящего: «перемотка назад», «пуск», «перемотка вперёд», «стоп» (как телефон на столе и стойка
 * радиопоста). В окошке видна кассета, катушки крутятся, пока идёт запись; счётчик — на корпусе.
 * Звука в сборке нет: под проигрывателем — строка записи той точки (K8; звук — на этапе дизайна).
 */

export const CASSETTE_ID = 'L462';

const W = 1.7;
const H = 1.05;
const D = 0.32;
const FRONT = D / 2;
const BODY = '#3d4045';
const INK = '#1d1d1d';
/** Наклон «как взяли в руки»; вплотную — лицом. */
const TILT: [number, number] = [0.45, -0.35];
/** Перемотка одним нажатием, с. */
const WIND = 5;

/** Рамка лицевой стороны: к ней подъезжает камера. */
const PLAYER_FOCUS: Focus = {
  name: 'cassette',
  x: 0,
  y: 0,
  z: FRONT,
  w: W,
  h: H,
  lift: 0.16,
  fill: [0.9, 0.5],
};

/** Где стоит перемотка и идёт ли запись — общее для модели и листа под ней. */
interface Tape {
  t: number;
  playing: boolean;
  dur: number;
  play(): void;
  stop(): void;
  wind(d: number): void;
}
const useTape = create<Tape>((set, get) => ({
  t: 0,
  playing: false,
  dur: 0,
  play() {
    const { t, dur } = get();
    // Кончилась — пуск с начала, как после перемотки.
    set({ playing: true, t: t >= dur ? 0 : t });
  },
  stop() {
    set({ playing: false });
  },
  wind(d) {
    const { t, dur } = get();
    set({ t: Math.max(0, Math.min(dur, t + d)) });
  },
}));

/** Запись идёт: секунда за секундой; дошла до конца — стоп. */
function useTapeClock() {
  const playing = useTape((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const { t, dur } = useTape.getState();
      const n = t + 0.25;
      useTape.setState(n < dur ? { t: n } : { t: dur, playing: false });
    }, 250);
    return () => clearInterval(id);
  }, [playing]);
}

function Player({ on, onUse }: { on: boolean; onUse: () => void }) {
  const body = useRef<Group>(null);
  const reels = useRef<(Mesh | null)[]>([]);
  const playing = useTape((s) => s.playing);
  const t = useTape((s) => Math.floor(s.t));
  const tape = useTape.getState;
  useAnimate((dt) => {
    const g = body.current;
    if (!g) return false;
    const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 10);
    const [tx, ty] = on ? [0, 0] : TILT;
    g.rotation.x += (tx - g.rotation.x) * k;
    g.rotation.y += (ty - g.rotation.y) * k;
    // Катушки крутятся, пока идёт запись.
    if (playing && !reducedMotion()) for (const r of reels.current) if (r) r.rotation.z -= dt * 3;
    return playing || Math.abs(tx - g.rotation.x) + Math.abs(ty - g.rotation.y) > SETTLED;
  });
  const unit = useActive('cassette-player', 'Слушать запись', 'cassette-player', onUse);
  const label = useTexture(
    () =>
      paintTexture(0.62, 0.16, '#f1eee6', ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        // Надпись на кассете — от руки (L462).
        text('06.10.08', w * 0.08, h * 0.12, w * 0.9, '700 80px "Comic Sans MS", cursive', 90);
      }),
    [],
  );
  const counter = useTexture(
    () =>
      paintTexture(0.34, 0.13, '#15171a', ({ ctx, w, h }) => {
        ctx.fillStyle = '#e8e2c8';
        ctx.font = `700 ${Math.round(h * 0.62)}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mmss(t), w / 2, h * 0.55);
      }),
    [t],
  );
  const hover = !on && unit.hover;
  return (
    <group ref={body} rotation={[TILT[0], TILT[1], 0]}>
      <group
        {...(on
          ? { onClick: (e: { stopPropagation(): void }) => e.stopPropagation() }
          : unit.handlers)}
      >
        {/* Корпус. */}
        <mesh>
          <boxGeometry args={[W, H, D]} />
          <meshStandardMaterial
            color={BODY}
            roughness={0.6}
            emissive="#2a3440"
            emissiveIntensity={hover ? 0.4 : 0}
          />
        </mesh>
        {/* Окошко и кассета в нём: корпус кассеты, наклейка «06.10.08», две катушки. */}
        <group position={[-0.25, 0.14, FRONT]} ref={on ? undefined : unit.anchor}>
          <mesh position={[0, 0, 0.004]}>
            <planeGeometry args={[0.98, 0.56]} />
            <meshStandardMaterial color="#1c1d1f" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.008]}>
            <planeGeometry args={[0.88, 0.48]} />
            <meshStandardMaterial color="#d9d6cc" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.13, 0.012]}>
            <planeGeometry args={[0.62, 0.16]} />
            <meshBasicMaterial map={label} toneMapped={false} />
          </mesh>
          {[-0.2, 0.2].map((x, k) => (
            <mesh
              key={x}
              position={[x, -0.08, 0.014]}
              ref={(m) => {
                reels.current[k] = m;
              }}
            >
              <ringGeometry args={[0.03, 0.09, 6]} />
              <meshStandardMaterial color="#3a3b3e" roughness={0.4} />
            </mesh>
          ))}
          {/* Стекло окошка. */}
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[0.98, 0.56]} />
            <meshStandardMaterial color="#9fb3c2" transparent opacity={0.12} roughness={0.05} />
          </mesh>
        </group>
        {/* Счётчик и огонёк. */}
        <mesh position={[0.5, 0.3, FRONT + 0.004]}>
          <planeGeometry args={[0.34, 0.13]} />
          <meshBasicMaterial map={counter} toneMapped={false} />
        </mesh>
        <mesh position={[0.74, 0.3, FRONT + 0.01]}>
          <sphereGeometry args={[0.025, 10, 10]} />
          <meshStandardMaterial
            color={playing ? '#ff7a6a' : '#5a2a26'}
            emissive="#ff3a20"
            emissiveIntensity={playing ? 1.6 : 0}
          />
        </mesh>
      </group>
      {/* Кнопки — на корпусе, справа от окошка; работают вплотную. */}
      <group position={[0, 0, FRONT]}>
        <Key
          on={on}
          at={[0.38, 0.02]}
          glyph="◀◀"
          label="Перемотка назад"
          testId="cassette-rew"
          action={() => tape().wind(-WIND)}
        />
        <Key
          on={on}
          at={[0.62, 0.02]}
          glyph="▶▶"
          label="Перемотка вперёд"
          testId="cassette-ff"
          action={() => tape().wind(WIND)}
        />
        <Key
          on={on}
          at={[0.38, -0.2]}
          glyph="▶"
          label="Пуск"
          testId="cassette-play"
          green
          action={() => tape().play()}
        />
        <Key
          on={on}
          at={[0.62, -0.2]}
          glyph="■"
          label="Стоп"
          testId="cassette-stop"
          action={() => tape().stop()}
        />
      </group>
      <Tag text="Окружное бюро расследований · инв." at={[-0.25, -0.38, FRONT + 0.01]} />
    </group>
  );
}

/** Кнопка на корпусе: значок краской на клавише; работает вплотную. */
function Key({
  on,
  at,
  glyph,
  label,
  testId,
  green,
  action,
}: {
  on: boolean;
  at: [number, number];
  glyph: string;
  label: string;
  testId: string;
  green?: boolean;
  action: () => void;
}) {
  const s = useActive(testId, label, testId, action);
  const color = green ? '#46603d' : '#2e3135';
  const face = useTexture(
    () =>
      paintTexture(0.2, 0.14, color, ({ ctx, w, h }) => {
        ctx.fillStyle = '#eef0f2';
        ctx.font = `700 ${Math.round(h * 0.46)}px "Segoe UI Symbol", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, w / 2, h * 0.54);
      }),
    [glyph, color],
  );
  const pressed = on && s.hover;
  return (
    <group position={[at[0], at[1], 0]} ref={on ? s.anchor : undefined}>
      <group position={[0, 0, pressed ? 0.012 : 0.022]}>
        <mesh {...(on ? s.handlers : {})}>
          <boxGeometry args={[0.2, 0.14, 0.04]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.0205]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshBasicMaterial map={face} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Под проигрывателем вплотную: что слышно в этой точке (звука в сборке нет, K8). */
function TapeSheet({ media }: { media: Media | null }) {
  const t = useTape((s) => s.t);
  const md = (s: string) => (
    <Markdown remarkPlugins={[remarkGfm]} components={NO_LINKS}>
      {s}
    </Markdown>
  );
  const row = media?.kind === 'timed' ? rowAt(media.rows, t) : null;
  return (
    <div
      className="cm-sheet"
      data-testid="cassette-sheet"
      data-material={CASSETTE_ID}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="cm-sheet-note">
        Звука в сборке пока нет — описание того, что в этой точке.
      </div>
      {media?.intro && <div className="mp-intro">{md(media.intro)}</div>}
      {media?.kind === 'timed' && row ? (
        <dl className="mp-row" data-testid="cassette-caption">
          {media.head.map((h, k) => (
            <div key={h}>
              <dt>{h}</dt>
              <dd>{row.cells[k]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p data-testid="cassette-caption">—</p>
      )}
    </div>
  );
}

export function CassetteHeld() {
  const body = useGame((g) => g.materials.find((m) => m.id === CASSETTE_ID)?.body ?? '');
  const media = useMemo(() => parseMedia(body), [body]);
  const [on, setOn] = useState(false);
  useTapeClock();
  // Новая вещь в руках — запись с начала, остановлена.
  useEffect(() => {
    useTape.setState({ t: 0, playing: false, dur: media?.kind === 'timed' ? media.dur : 0 });
    return () => useTape.setState({ playing: false });
  }, [media]);
  // Вплотную: пробел — пуск / стоп, стрелки — перемотка.
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useTape.getState();
      if (e.key === ' ') s.playing ? s.stop() : s.play();
      else if (e.key === 'ArrowLeft') s.wind(-WIND);
      else if (e.key === 'ArrowRight') s.wind(WIND);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
  return (
    <Held3D
      mode="free"
      half={[1.7, 1.2]}
      label="Проигрыватель микрокассет бюро с кассетой «06.10.08»"
      onClose={() => useGame.getState().hold(null)}
      focus={on ? PLAYER_FOCUS : null}
      onUnfocus={() => {
        useTape.getState().stop();
        setOn(false);
      }}
      extra={on ? <TapeSheet media={media} /> : null}
    >
      <Player on={on} onUse={() => setOn(true)} />
    </Held3D>
  );
}
