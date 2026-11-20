import { useGame } from '../store.ts';
import Held3D, { afterLeaving } from './Held3D.tsx';
import { Plate, Tag, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Микрокассета «06.10.08» и проигрыватель микрокассет бюро (A-272, AC-4; L462): из коробки банка.
 * В руках — проигрыватель с инвентарной биркой бюро и кассета в футляре с надписью от руки;
 * «Вставить кассету в проигрыватель» — запись (0:36) в общем плеере. Бумажной расшифровки нет:
 * в плеере — строка записи по времени (звук и субтитры — на этапе дизайна звука, автор 18.11).
 */

export const CASSETTE_ID = 'L462';

const BODY = '#3d4045';
const CASE = '#d9d6cc';
const INK = '#1d1d1d';

function Player({ inserted }: { inserted: boolean }) {
  const label = useTexture(
    () =>
      paintTexture(0.9, 0.5, '#f1eee6', ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        // Надпись на корпусе — от руки (L462).
        text('06.10.08', w * 0.08, h * 0.3, w * 0.9, '700 100px "Comic Sans MS", cursive', 110);
      }),
    [],
  );
  return (
    <group rotation={[0.45, -0.35, 0]}>
      {/* Проигрыватель: корпус, окошко кассеты, кнопки. */}
      <mesh position={[-0.55, 0, 0]}>
        <boxGeometry args={[1.5, 0.95, 0.32]} />
        <meshStandardMaterial color={BODY} roughness={0.6} />
      </mesh>
      <mesh position={[-0.75, 0.1, 0.165]}>
        <boxGeometry args={[0.9, 0.5, 0.02]} />
        <meshStandardMaterial color={inserted ? '#5b5e63' : '#1c1d1f'} roughness={0.3} />
      </mesh>
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[-0.95 + k * 0.32, -0.32, 0.17]}>
          <boxGeometry args={[0.24, 0.12, 0.04]} />
          <meshStandardMaterial color="#8b8e93" roughness={0.5} />
        </mesh>
      ))}
      <Tag text="Окружное бюро расследований · инв." at={[-0.55, -0.62, 0.17]} />
      {/* Кассета в футляре — рядом, пока не вставлена. */}
      {!inserted && (
        <group position={[0.85, -0.05, 0.05]} rotation={[0, 0, -0.12]}>
          <mesh>
            <boxGeometry args={[0.9, 0.6, 0.12]} />
            <meshStandardMaterial color={CASE} roughness={0.4} transparent opacity={0.85} />
          </mesh>
          <Plate w={0.62} h={0.34} z={0.062} map={label} />
        </group>
      )}
    </group>
  );
}

export function CassetteHeld() {
  // Вставлена — так и лежит: при новом взятии кассета уже в проигрывателе (UX-17, SP-4).
  const inserted = useGame((g) => !!g.state?.cassetteIn);
  const close = () => useGame.getState().hold(null);
  const listen = () =>
    afterLeaving(() => {
      useGame.getState().hold(null);
      // Лист записи — плеером (не «взять в руки» снова: кассета — вещь на столе).
      useGame.getState().readMaterial(CASSETTE_ID);
    });
  return (
    <Held3D
      mode="free"
      half={[1.7, 1.2]}
      label="Проигрыватель микрокассет бюро и кассета «06.10.08»"
      onClose={close}
      action={
        <div className="held-action">
          <button
            type="button"
            className="tool held-action-btn"
            data-testid="cassette-insert"
            onClick={() => {
              useGame.getState().insertCassette();
              listen();
            }}
          >
            {inserted ? 'Слушать' : 'Вставить кассету в проигрыватель'}
          </button>
        </div>
      }
    >
      <Player inserted={inserted} />
    </Held3D>
  );
}
