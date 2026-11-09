import { lazy, Suspense } from 'react';
import { useGame } from '../store.ts';

// Сцена 3D (three.js) грузится, только когда вещь взяли в руки: стол открывается быстро.
const HeldScene = lazy(() => import('./HeldScene.tsx'));

/**
 * Вещь в руках (этап 4a): конверт и коробка архива (A-260), изъятые устройства. Вещь вертят и
 * приближают мышью; щелчок по печати вскрывает конверт (документы выходят карточками и
 * вешаются на стену), щелчок по экрану включает устройство (в 4a — лист материала; экраны
 * устройств — этап 4c).
 */
export function HeldView() {
  const held = useGame((g) => g.held);
  if (!held) return null;
  return (
    <Suspense fallback={<div className="held held-loading" />}>
      <HeldScene key={`${held.type}:${held.id}`} held={held} />
    </Suspense>
  );
}
