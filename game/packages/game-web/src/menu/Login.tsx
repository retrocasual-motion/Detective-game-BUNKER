import { type FormEvent, useEffect, useState } from 'react';
import { App } from '../App.tsx';
import { requestLogin } from '../api.ts';
import { useAccount } from './account.ts';

/**
 * Вход в дело (6a-1, T-14-A): почта → письмо со ссылкой → ссылка открывает дело в этом
 * браузере. Пароля нет. Оформление — на этапе дизайна.
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!to) return;
    setBusy(true);
    setError(null);
    const r = await requestLogin(to);
    setBusy(false);
    if ('error' in r) setError(r.error);
    else {
      setSentTo(to);
      setAgain(r.again === true);
    }
  };

  return (
    <div className="main-menu login" data-testid="login">
      <div className="main-menu-card">
        <h1 className="main-menu-title">БУНКЕР</h1>
        <p className="main-menu-sub">Дело № 09-1128</p>
        {sentTo ? (
          <div className="main-menu-panel" role="status" data-testid="login-sent">
            <p>
              {again ? 'Письмо уже отправлено' : 'Письмо отправлено'} на <b>{sentTo}</b>. Откройте
              ссылку из письма в этом браузере — дело откроется здесь.
            </p>
            {import.meta.env.DEV && (
              <p className="login-dev">
                На компьютере письма приходят в ловушку писем:{' '}
                <a href="http://localhost:8025" target="_blank" rel="noreferrer">
                  localhost:8025
                </a>
              </p>
            )}
            <div className="main-menu-row">
              <button type="button" onClick={() => setSentTo(null)}>
                Другая почта
              </button>
            </div>
          </div>
        ) : (
          <form className="main-menu-panel" onSubmit={(e) => void send(e)}>
            <label className="login-field">
              Ваша почта
              <input
                type="email"
                autoComplete="email"
                data-testid="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <p className="login-hint">Пришлём ссылку для входа. Пароль не нужен.</p>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <div className="main-menu-row">
              <button
                type="submit"
                className="main-menu-main"
                data-testid="login-send"
                disabled={busy}
              >
                Получить ссылку
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Сначала — кто играет; без входа — экран входа, игра не грузится. */
export function Gate() {
  const status = useAccount((a) => a.status);
  useEffect(() => {
    void useAccount.getState().check();
  }, []);
  if (status === 'in') return <App />;
  if (status === 'out') return <Login />;
  return (
    <div className="placeholder">
      {status === 'offline' ? 'Сервер пока не отвечает, пробуем ещё…' : 'Загрузка…'}
    </div>
  );
}
