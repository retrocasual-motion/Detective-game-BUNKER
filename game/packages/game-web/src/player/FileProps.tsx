import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { postAction } from '../api.ts';
import { NO_LINKS } from '../paperLinks.tsx';
import { useGame } from '../store.ts';
import './player.css';

/**
 * «Свойства файла» у записи (F3, A-251: свойства — только у медиафайлов): фильмы 13, 14, голосовая
 * почта 21, ручка-диктофон 49, регистратор радиопоста 50. Первое нажатие — движок (ОСМОТР
 * «свойства»): материал свойств открыт и висит на стене; таблица — тут же, под плеером. Как
 * «Свойства» у звука в проводнике ноутбука и DISP у камеры.
 */
export function FileProps({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const props = useGame((g) =>
    g.materials.find((m) => /^Свойства файл/.test(m.title) && m.title.includes(`(файл ${id})`)),
  );
  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (props) return;
    const r = await postAction('ОСМОТР', id, 'свойства').catch(() => null);
    if (!r) setMsg('Нет связи с сервером игры — попробуйте ещё раз.');
    else if (r.released.length) useGame.getState().addFound(r.released, id, []);
    else setMsg(r.reply);
  };
  return (
    <div className="mp-props-box">
      <button
        type="button"
        className="mp-props-btn"
        data-testid="media-props"
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        Свойства файла
      </button>
      {open && (
        <div className="mp-props" data-testid="media-props-view" data-material={props?.id}>
          {props ? (
            <Markdown remarkPlugins={[remarkGfm]} components={NO_LINKS}>
              {props.body.replace(/^# [^\n]*\n+/, '')}
            </Markdown>
          ) : (
            <p>{msg || '…'}</p>
          )}
        </div>
      )}
    </div>
  );
}
