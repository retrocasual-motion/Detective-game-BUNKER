import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Media, mmss, parseMedia, rowAt } from './media.ts';
import './player.css';

/**
 * Плеер записи (этап 4d; PL-A — там, где запись лежит). Назад · play · вперёд (автор 12.11:
 * «вперёд-назад, play»), шкала текущего файла, щелчок по шкале — перемотка. Звука в сборке пока
 * нет (K8): для файлов — расшифровка текущего файла, для таблиц по времени — строка той точки,
 * где стоит перемотка. `pen` — ручка-диктофон без дисплея: имени файла на ней не видно.
 */
export function MediaPlayer({
  materialId,
  body,
  pen = false,
}: {
  materialId: string;
  body: string;
  pen?: boolean;
}) {
  const media = useMemo<Media | null>(() => parseMedia(body), [body]);
  const [file, setFile] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dur = media?.kind === 'files' ? (media.files[file]?.dur ?? 0) : (media?.dur ?? 0);
  const count = media?.kind === 'files' ? media.files.length : 1;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const n = x + 0.25;
        if (n < dur) return n;
        // Конец файла — следующий файл, как на настоящем плеере; последний — стоп.
        if (media?.kind === 'files' && file + 1 < count) {
          setFile(file + 1);
          return 0;
        }
        setPlaying(false);
        return dur;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, dur, file, count, media]);

  if (!media) return null;
  const go = (k: number) => {
    setFile(Math.max(0, Math.min(count - 1, k)));
    setT(0);
  };
  // «Назад»: в начале файла — предыдущий файл, иначе — к началу этого (как на диктофонах).
  const back = () => (t > 2 || file === 0 ? setT(0) : go(file - 1));
  const fwd = () => (file + 1 < count ? go(file + 1) : setT(dur));
  const row = media.kind === 'timed' ? rowAt(media.rows, t) : null;
  // Переносы строк исходника — не переносы фразы: абзацы текут по ширине.
  const md = (s: string) => <Markdown remarkPlugins={[remarkGfm]}>{s}</Markdown>;

  return (
    <div className={`mp${pen ? ' mp-pen' : ''}`} data-testid="media-player">
      {!pen && media.intro && <div className="mp-intro">{md(media.intro)}</div>}
      {!pen && media.kind === 'files' && (
        <ol className="mp-files">
          {media.files.map((f, k) => (
            <li key={f.name}>
              <button
                type="button"
                className={k === file ? 'mp-file-on' : undefined}
                data-testid={`media-file-${k + 1}`}
                onClick={() => go(k)}
              >
                {f.name} · {mmss(f.dur)}
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="mp-ctl">
        <button type="button" aria-label="Назад" data-testid="media-back" onClick={back}>
          ⏮
        </button>
        <button
          type="button"
          className="mp-play"
          aria-label={playing ? 'Пауза' : 'Воспроизведение'}
          data-testid="media-play"
          onClick={() => {
            if (!playing && t >= dur) setT(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" aria-label="Вперёд" data-testid="media-fwd" onClick={fwd}>
          ⏭
        </button>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: шкала — щелчок ставит перемотку; с клавиатуры — «назад», «вперёд» */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: шкала записи */}
        <div
          className="mp-bar"
          data-testid="media-bar"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setT(Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur)));
          }}
        >
          <span className="mp-bar-fill" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} />
        </div>
        <span className="mp-time" data-testid="media-time">
          {mmss(t)} / {mmss(dur)}
        </span>
      </div>
      <div className="mp-caption" data-testid="media-caption" data-material={materialId}>
        <div className="mp-note">
          Звука в сборке пока нет —{' '}
          {media.kind === 'files' ? 'расшифровка этой записи.' : 'описание того, что в этой точке.'}
        </div>
        {media.kind === 'files' ? (
          <>
            <div className="mp-caption-head" data-testid="media-name">
              {media.files[file]?.name}
              {pen ? ` · ${file + 1} из ${count}` : ''}
            </div>
            {md(media.files[file]?.text ?? '')}
          </>
        ) : row ? (
          <dl className="mp-row">
            {media.head.map((h, k) => (
              <div key={h}>
                <dt>{h}</dt>
                <dd>{row.cells[k]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>—</p>
        )}
      </div>
    </div>
  );
}
