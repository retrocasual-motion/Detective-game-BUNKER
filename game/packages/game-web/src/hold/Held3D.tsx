import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { type Group, type Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { reducedMotion } from '../motion.ts';
import { clampPitch, orient } from './orient.ts';
import { zoomStep } from './zoom.ts';

/**
 * Вещь в руках (этап 4a, решения автора 09.11): без меню и кнопок — всё руками.
 * Зажать и тянуть — вращать; колесо — ближе к той точке, что под курсором (не общий зум);
 * правая кнопка — как было, зажатое колесо — сдвинуть вещь (правка автора 10.11; прежде
 * «как было» — средняя); щелчок по самой вещи (печать, экран) — вскрыть или включить;
 * щелчок мимо, ✕ или Esc — положить. Лист и конверт только переворачиваются (лицо/оборот) и
 * ложатся ровно — читать всегда удобно; предметы вертятся свободно.
 */

export type HoldMode = 'free' | 'flip';

/**
 * Работа с частью вещи вплотную (стойка радиопоста, автор 12.11): вещь встаёт лицом, камера
 * подъезжает к этой части, вращение и приближение колесом выключены. Мировые координаты части
 * лицом к камере: центр, ширина, высота, z — где её лицевая плоскость; lift — насколько поднять её
 * над серединой (доля кадра), чтобы снизу осталось место для листа описания.
 */
export interface Focus {
  name: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  lift?: number;
}

/** Что творит мышь — общее для DOM-обёртки и сцены. */
interface Gesture {
  /** Сдвиг с прошлого кадра, px. */
  dx: number;
  dy: number;
  /** Сколько протянули с нажатия, px: больше порога — это был не щелчок. */
  moved: number;
  /** Отпустили — лист ложится к ближайшей стороне. */
  released: boolean;
  wheel: { x: number; y: number; deltaY: number }[];
  reset: boolean;
  /** Сдвиг зажатым колесом с прошлого кадра, px. */
  panX: number;
  panY: number;
  /** За часть вещи взялись (тянут край картона) — вещь не вращается. */
  part: boolean;
}

/** Порог «щелчок, а не протяжка», px. */
const CLICK_PX = 5;
const CAM_Z = 6;
const MIN_Z = 1.2;
const ROT_PER_PX = 0.009;
/** Наклон вверх-вниз слабее поворота влево-вправо. */
const PITCH_SOFT = 0.75;
const ZOOM_STEP = 1.2;

const Y = new Vector3(0, 1, 0);

// ── Вещь в руках одна: её жест, «уйти» и активные части — на уровне модуля. ──

let gestureNow: RefObject<Gesture> | null = null;
let wrapNow: HTMLDivElement | null = null;

/**
 * Курсор над частью вещи (печать, экран, край картона): ставится на саму сцену — у неё свой
 * курсор «взять», курсор страницы под ним не виден. '' — снова «взять».
 */
export function setPartCursor(cursor: string) {
  if (wrapNow) wrapNow.style.cursor = cursor;
}
let leaveNow: ((then: () => void) => void) | null = null;

/**
 * Живой экран на вещи (регистратор): обычная разметка страницы «приклеена» к плоскости экрана —
 * каждый кадр она ставится и масштабируется по проекции плоскости. w, h — размер плоскости в её
 * координатах.
 */
let screenNow: { obj: Object3D; w: number; h: number } | null = null;
export function useScreenAnchor(ref: RefObject<Object3D | null>, w: number, h: number) {
  useEffect(() => {
    const obj = ref.current;
    if (!obj) return;
    screenNow = { obj, w, h };
    return () => {
      if (screenNow?.obj === obj) screenNow = null;
    };
  });
}

/** Щелчок по части вещи — только если мышь почти не двигалась (иначе вещь вращали). */
export function onClickPart(fn: () => void) {
  return (e?: ThreeEvent<MouseEvent> | { stopPropagation(): void }) => {
    e?.stopPropagation();
    if ((gestureNow?.current.moved ?? 0) < CLICK_PX) fn();
  };
}

/** Часть вещи берёт протяжку себе (тянут край картона): вещь при этом не вращается. */
export function holdPart() {
  if (gestureNow) gestureNow.current.part = true;
}

/**
 * Сделать то, что убирает сцену (вскрыть, включить): сначала снять вещь, пока сцена жива,
 * потом действие.
 */
export const afterLeaving = (then: () => void) => (leaveNow ? leaveNow(then) : then());

/**
 * Активная часть вещи (печать, экран): поверх неё — невидимая кнопка, которая идёт за ней по
 * экрану. Её нажимают с клавиатуры (Tab, Enter) и находят автотесты; мышью жмут саму часть.
 */
interface Spot {
  id: string;
  obj: Object3D;
  label: string;
  testId: string;
  onClick: () => void;
  /** Мышь над невидимой кнопкой: она лежит поверх части и забирает наведение у сцены. */
  onHover?: (on: boolean) => void;
  /** Кнопка не ловит мышь (только клавиатура и тесты): наведение и щелчок — у самой части. */
  passive?: boolean;
}
const spots = new Map<string, Spot>();
let spotList: Spot[] = [];
const spotListeners = new Set<() => void>();
const changed = () => {
  spotList = [...spots.values()];
  for (const l of spotListeners) l();
};

export function useSpot(ref: RefObject<Object3D | null>, spot: Omit<Spot, 'obj'>) {
  const { id, label, testId, passive } = spot;
  const click = useRef(spot.onClick);
  click.current = spot.onClick;
  const hover = useRef(spot.onHover);
  hover.current = spot.onHover;
  // После каждой отрисовки: часть могла появиться позже (стопка переложенных листов) или пропасть.
  useEffect(() => {
    const obj = ref.current;
    const cur = spots.get(id);
    if (!obj) {
      if (cur) {
        spots.delete(id);
        changed();
      }
      return;
    }
    if (cur?.obj === obj && cur.label === label && cur.testId === testId && cur.passive === passive)
      return;
    spots.set(id, {
      id,
      label,
      testId,
      obj,
      onClick: () => click.current(),
      onHover: (on) => hover.current?.(on),
      passive,
    });
    changed();
  });
  useEffect(
    () => () => {
      spots.delete(id);
      changed();
    },
    [id],
  );
}

function Rig({
  gesture,
  mode,
  half,
  onSide,
  buttons,
  focus,
  screen,
  screenW,
  children,
}: {
  gesture: RefObject<Gesture>;
  mode: HoldMode;
  focus: Focus | null;
  screen: RefObject<HTMLDivElement | null>;
  /** Ширина разметки экрана в её px (масштаб — по проекции). */
  screenW: number;
  /** Половина размера вещи — дальше камеру не уводим. */
  half: [number, number];
  onSide: (back: boolean) => void;
  buttons: RefObject<Map<string, HTMLButtonElement>>;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const { camera, size } = useThree();
  const camTarget = useRef(new Vector3(0, 0, CAM_Z));
  // Свободный поворот: два угла без крена (orient.ts).
  const pitch = useRef(0);
  const yaw = useRef(0);
  const side = useRef(false);
  const tmp = useRef(new PerspectiveCamera());

  // Приблизить к точке под курсором: камера едет по лучу через курсор, точка остаётся под ним.
  const zoomAt = (x: number, y: number, deltaY: number) => {
    const factor = deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const cam = tmp.current;
    cam.copy(camera as PerspectiveCamera);
    cam.position.copy(camTarget.current);
    cam.updateMatrixWorld();
    const dir = new Vector3(x, y, 0.5).unproject(cam).sub(camTarget.current).normalize();
    const p = camTarget.current.clone().addScaledVector(dir, -camTarget.current.z / dir.z);
    const next = zoomStep(camTarget.current, p, factor, { minZ: MIN_Z, maxZ: CAM_Z, half });
    camTarget.current.copy(next);
  };

  const wasFocused = useRef(false);
  useFrame((_, dt) => {
    const g = gesture.current;
    // Отошли от части — камера обратно, вещь снова в руках целиком.
    if (!focus && wasFocused.current) camTarget.current.set(0, 0, CAM_Z);
    wasFocused.current = !!focus;
    if (focus) {
      // Вплотную: вещь лицом, камера у части; мышь крутит ручки, а не вещь.
      g.dx = 0;
      g.dy = 0;
      g.panX = 0;
      g.panY = 0;
      g.wheel.length = 0;
      g.reset = false;
      yaw.current = Math.round(yaw.current / (2 * Math.PI)) * 2 * Math.PI;
      pitch.current = 0;
      const tan = Math.tan((30 * Math.PI) / 360);
      const aspect = size.width / Math.max(1, size.height);
      const d = Math.max(focus.w / (0.9 * 2 * tan * aspect), focus.h / (0.62 * 2 * tan));
      camTarget.current.set(focus.x, focus.y - (focus.lift ?? 0) * 2 * d * tan, focus.z + d);
    }
    if (g.part) {
      g.dx = 0;
      g.dy = 0;
    }
    if (g.panX || g.panY) {
      // Сдвиг зажатым колесом: вещь едет за мышью (камера — обратно), не дальше края вещи.
      const per = (2 * camTarget.current.z * Math.tan((30 * Math.PI) / 360)) / size.height;
      const t = camTarget.current;
      t.x = Math.max(-half[0], Math.min(half[0], t.x - g.panX * per));
      t.y = Math.max(-half[1], Math.min(half[1], t.y + g.panY * per));
      g.panX = 0;
      g.panY = 0;
    }
    if (g.dx || g.dy) {
      if (mode === 'flip') yaw.current += g.dx * ROT_PER_PX;
      else {
        yaw.current += g.dx * ROT_PER_PX;
        // Наклон к игроку — мягче поворота: вещь не уходит в неудобный ракурс (правка автора 09.11).
        pitch.current = clampPitch(pitch.current + g.dy * ROT_PER_PX * PITCH_SOFT);
      }
      g.dx = 0;
      g.dy = 0;
    }
    if (g.released) {
      g.released = false;
      // Лист ложится ровно: лицом или оборотом, как ближе.
      if (mode === 'flip') yaw.current = Math.round(yaw.current / Math.PI) * Math.PI;
    }
    for (const w of g.wheel.splice(0)) zoomAt(w.x, w.y, w.deltaY);
    if (g.reset) {
      g.reset = false;
      pitch.current = 0;
      yaw.current = Math.round(yaw.current / (2 * Math.PI)) * 2 * Math.PI;
      camTarget.current.set(0, 0, CAM_Z);
    }
    const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 12);
    const target =
      mode === 'flip'
        ? new Quaternion().setFromAxisAngle(Y, yaw.current)
        : orient(yaw.current, pitch.current);
    group.current?.quaternion.slerp(target, k);
    camera.position.lerp(camTarget.current, k);
    camera.updateMatrixWorld();
    if (mode === 'flip') {
      const back = Math.cos(yaw.current) < 0;
      if (back !== side.current) {
        side.current = back;
        onSide(back);
      }
    }
    // Живой экран — по проекции плоскости, когда она встала лицом к камере.
    const el = screen.current;
    if (el) {
      const a = screenNow;
      let shown = false;
      if (focus && a) {
        const q = a.obj.getWorldQuaternion(new Quaternion());
        const n = new Vector3(0, 0, 1).applyQuaternion(q);
        if (n.z > 0.999) {
          const tl = a.obj.localToWorld(new Vector3(-a.w / 2, a.h / 2, 0)).project(camera);
          const br = a.obj.localToWorld(new Vector3(a.w / 2, -a.h / 2, 0)).project(camera);
          const left = ((tl.x + 1) / 2) * size.width;
          const right = ((br.x + 1) / 2) * size.width;
          const top = ((1 - tl.y) / 2) * size.height;
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
          el.style.transform = `scale(${(right - left) / screenW})`;
          shown = true;
        }
      }
      el.style.visibility = shown ? 'visible' : 'hidden';
    }
    // Кнопки активных частей — за частями; у отвёрнутой от камеры части кнопки нет.
    for (const s of spots.values()) {
      const b = buttons.current.get(s.id);
      if (!b) continue;
      const pos = s.obj.getWorldPosition(new Vector3());
      const normal = new Vector3(0, 0, 1).applyQuaternion(
        s.obj.getWorldQuaternion(new Quaternion()),
      );
      const facing = normal.dot(camera.position.clone().sub(pos)) > 0;
      const p = pos.project(camera);
      b.style.display = facing ? 'block' : 'none';
      b.style.left = `${((p.x + 1) / 2) * size.width}px`;
      b.style.top = `${((1 - p.y) / 2) * size.height}px`;
    }
  });

  return <group ref={group}>{children}</group>;
}

export interface Held3DProps {
  mode: HoldMode;
  half: [number, number];
  label: string;
  /** Подпись внизу (лист пачки «18 из 41»). */
  caption?: string;
  onClose: () => void;
  /** Работа с частью вещи вплотную; Esc, щелчок мимо или ✕ — onUnfocus (снова вещь в руках). */
  focus?: Focus | null;
  onUnfocus?: () => void;
  /** Разметка живого экрана (useScreenAnchor) и её ширина в px. */
  screen?: ReactNode;
  screenW?: number;
  /** Что ещё лежит поверх сцены вплотную (лист описания). */
  extra?: ReactNode;
  children: ReactNode;
}

/** Сцена с вещью и жесты мыши; сама вещь — children (формы из shapes.tsx). */
export default function Held3D({
  mode,
  half,
  label,
  caption,
  onClose: close,
  focus = null,
  onUnfocus,
  screen,
  screenW = 1000,
  extra,
  children,
}: Held3DProps) {
  const screenEl = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>({
    dx: 0,
    dy: 0,
    moved: 0,
    released: false,
    wheel: [],
    reset: false,
    panX: 0,
    panY: 0,
    part: false,
  });
  const wrap = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const list = useSyncExternalStore(
    (l) => {
      spotListeners.add(l);
      return () => spotListeners.delete(l);
    },
    () => spotList,
  );
  // Положить: сначала убрать вещь, пока сцена жива, потом сцену.
  const [leaving, setLeaving] = useState(false);
  const leave = (then: () => void) => {
    setLeaving(true);
    requestAnimationFrame(() => requestAnimationFrame(then));
  };
  gestureNow = gesture;
  leaveNow = leave;
  wrapNow = wrap.current;
  const onClose = () => {
    if (focus && onUnfocus) {
      onUnfocus();
      return;
    }
    if (!leaving) leave(close);
  };
  const closeNow = useRef(onClose);
  closeNow.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // В поле ввода (подпись метки) Esc — его, не вещи.
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      closeNow.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Протяжку ведём по окну: кнопка может уйти за край вещи и даже экрана.
  const onPointerDown = (e: ReactPointerEvent) => {
    const g = gesture.current;
    // Правая кнопка — вернуть как было (правка автора 10.11; прежде — средняя); вплотную —
    // отойти: снова вещь в руках (правка автора 17.11).
    if (e.button === 2) {
      e.preventDefault();
      if (focus && onUnfocus) onUnfocus();
      else g.reset = true;
      return;
    }
    // Зажатое колесо — сдвинуть вещь (правка автора 10.11).
    if (e.button === 1) {
      e.preventDefault();
      let at = { x: e.clientX, y: e.clientY };
      const pan = (ev: PointerEvent) => {
        g.panX += ev.clientX - at.x;
        g.panY += ev.clientY - at.y;
        at = { x: ev.clientX, y: ev.clientY };
      };
      const stop = () => {
        window.removeEventListener('pointermove', pan);
        window.removeEventListener('pointerup', stop);
      };
      window.addEventListener('pointermove', pan);
      window.addEventListener('pointerup', stop);
      return;
    }
    if (e.button !== 0) return;
    g.moved = 0;
    let last = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      g.dx += ev.clientX - last.x;
      g.dy += ev.clientY - last.y;
      g.moved += Math.abs(ev.clientX - last.x) + Math.abs(ev.clientY - last.y);
      last = { x: ev.clientX, y: ev.clientY };
    };
    const up = () => {
      g.released = true;
      g.part = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={(el) => {
        wrap.current = el;
        wrapNow = el;
      }}
      role="application"
      className="held"
      data-testid="held"
      data-side="front"
      data-focus={focus?.name ?? ''}
      aria-label={label}
      onPointerDown={onPointerDown}
      onWheel={(e) => {
        const r = wrap.current?.getBoundingClientRect();
        if (!r) return;
        gesture.current.wheel.push({
          x: ((e.clientX - r.left) / r.width) * 2 - 1,
          y: -((e.clientY - r.top) / r.height) * 2 + 1,
          deltaY: e.deltaY,
        });
      }}
      // Колесо-кнопка в браузере включает автопрокрутку — здесь она не нужна.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        camera={{ position: [0, 0, CAM_Z], fov: 30 }}
        dpr={[1, 2]}
        onPointerMissed={() => {
          if (gesture.current.moved < CLICK_PX) onClose();
        }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, 3, 5]} intensity={1.3} />
        <directionalLight position={[-3, -1, -4]} intensity={0.6} />
        <Rig
          gesture={gesture}
          mode={mode}
          half={half}
          buttons={buttons}
          focus={focus}
          screen={screenEl}
          screenW={screenW}
          onSide={(back) => {
            if (wrap.current) wrap.current.dataset.side = back ? 'back' : 'front';
          }}
        >
          {leaving ? null : children}
        </Rig>
      </Canvas>
      {screen && (
        <div
          ref={screenEl}
          className="held-screen"
          style={{ width: screenW }}
          // Экран — интерфейс: щелчок по нему не «мимо»; правая кнопка — отойти (как везде вплотную).
          onPointerDown={(e) => {
            if (e.button !== 2) e.stopPropagation();
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          {screen}
        </div>
      )}
      {list.map((s) => (
        <button
          key={s.id}
          ref={(b) => {
            if (b) buttons.current.set(s.id, b);
            else buttons.current.delete(s.id);
          }}
          type="button"
          className={s.passive ? 'held-spot held-spot-passive' : 'held-spot'}
          data-testid={s.testId}
          aria-label={s.label}
          onClick={onClickPart(s.onClick)}
          onPointerEnter={() => s.onHover?.(true)}
          onPointerLeave={() => s.onHover?.(false)}
        />
      ))}
      {caption && (
        <p className="held-caption" data-testid="held-caption">
          {caption}
        </p>
      )}
      {focus && extra}
      <button
        type="button"
        className="tool tool-close held-close"
        aria-label={focus ? 'Отойти' : 'Положить'}
        title={focus ? 'Отойти (Esc)' : 'Положить (Esc)'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}
