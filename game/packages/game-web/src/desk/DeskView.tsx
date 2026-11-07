import type { Camera, Material } from '@bunker/shared';
import { useCallback, useMemo } from 'react';
import { Canvas } from '../canvas/Canvas.tsx';
import { useGame } from '../store.ts';
import { MaterialCard } from './MaterialCard.tsx';

/** Стол следователя: стартовые материалы на бесконечной поверхности (TECH_PLAN 4.2). */
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
          items: s.desk.items.map((i) => (i.materialId === materialId ? { ...i, x, y } : i)),
        },
      })),
    [updateState],
  );

  if (!desk) return null;

  return (
    <Canvas camera={desk.camera} onCameraChange={setCamera} className="desk" testId="view-desk">
      {desk.items.map((item) => {
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
  );
}
