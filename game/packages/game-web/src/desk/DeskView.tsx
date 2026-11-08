import { type Camera, DESK_BOUNDS, type Material } from '@bunker/shared';
import { useCallback, useMemo } from 'react';
import { Canvas } from '../canvas/Canvas.tsx';
import { screenToWorld } from '../canvas/math.ts';
import { useGame } from '../store.ts';
import { InboxTray } from './InboxTray.tsx';
import { MaterialCard } from './MaterialCard.tsx';

/** Небольшой поворот вынутого из лотка листа — свой у каждого, одинаковый при каждом вынимании. */
const tilt = (id: string) => ((Number(id.replace(/\D/g, '')) * 7) % 11) - 5;

/** Лист нельзя уронить за край стола (UX-B1): угол листа остаётся на столешнице. */
const onDesk = (x: number, y: number) => ({
  x: Math.min(DESK_BOUNDS.right - 60, Math.max(DESK_BOUNDS.left, x)),
  y: Math.min(DESK_BOUNDS.bottom - 60, Math.max(DESK_BOUNDS.top, y)),
});

/** Стол следователя: стартовые материалы на столешнице с краем (TECH_PLAN 4.2, UX-B1). */
export function DeskView({ onOpen }: { onOpen?(materialId: string): void }) {
  const desk = useGame((g) => g.state?.desk);
  const materials = useGame((g) => g.materials);
  const updateState = useGame((g) => g.updateState);

  const byId = useMemo(
    () => new Map<string, Material>(materials.map((m) => [m.id, m])),
    [materials],
  );

  const setCamera = useCallback(
    (camera: Camera) => updateState((s) => ({ ...s, desk: { ...s.desk, camera } })),
    [updateState],
  );

  // Взятая карточка ложится поверх остальных.
  const grab = useCallback(
    (materialId: string) =>
      updateState((s) => {
        const top = Math.max(0, ...s.desk.items.map((i) => i.z));
        const items = s.desk.items.map((i) =>
          i.materialId === materialId && i.z !== top ? { ...i, z: top + 1 } : i,
        );
        return { ...s, desk: { ...s.desk, items } };
      }),
    [updateState],
  );

  const move = useCallback(
    (materialId: string, x: number, y: number) =>
      updateState((s) => ({
        ...s,
        desk: {
          ...s.desk,
          items: s.desk.items.map((i) =>
            i.materialId === materialId ? { ...i, ...onDesk(x, y) } : i,
          ),
        },
      })),
    [updateState],
  );

  // Вынуть из лотка «Входящие» на стол — туда, куда отпустили, или в середину видимого стола.
  const takeOut = useCallback(
    (materialId: string, at: { x: number; y: number } | null) => {
      const r = document.querySelector('.canvas.desk')?.getBoundingClientRect();
      updateState((s) => {
        const screen =
          at && r
            ? { x: at.x - r.left, y: at.y - r.top }
            : { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
        const w = screenToWorld(screen, s.desk.camera);
        const top = Math.max(0, ...s.desk.items.map((i) => i.z));
        const items = s.desk.items.map((i) =>
          i.materialId === materialId
            ? {
                ...i,
                ...onDesk(w.x - 80, w.y - 110),
                tray: false,
                z: top + 1,
                rot: tilt(materialId),
              }
            : i,
        );
        return { ...s, desk: { ...s.desk, items } };
      });
    },
    [updateState],
  );

  if (!desk) return null;

  return (
    <>
      <Canvas
        camera={desk.camera}
        onCameraChange={setCamera}
        className="desk"
        testId="view-desk"
        bounds={DESK_BOUNDS}
        surface={DESK_BOUNDS}
      >
        {desk.items.map((item) => {
          if (item.tray) return null;
          const material = byId.get(item.materialId);
          return material ? (
            <MaterialCard
              key={item.materialId}
              item={item}
              material={material}
              zoom={desk.camera.zoom}
              onMove={move}
              onGrab={grab}
              onOpen={onOpen}
            />
          ) : null;
        })}
      </Canvas>
      <InboxTray onTakeOut={takeOut} />
    </>
  );
}
