import { create } from 'zustand';
import { getMe, logout, type Me, setOnSignedOut } from '../api.ts';

/**
 * Кто играет (6a-1): вход по ссылке на почту. Пока сервер не сказал «вошёл» — экран входа,
 * игра не грузится. `auth: 'off'` — сервер без входа (один игрок, автотесты).
 */
interface AccountStore {
  status: 'checking' | 'in' | 'out' | 'offline';
  me: Me | null;
  check(): Promise<void>;
  logout(): Promise<void>;
}

export const useAccount = create<AccountStore>((set, get) => ({
  status: 'checking',
  me: null,

  async check() {
    // Сервер мог ещё не подняться — повторяем раз в секунду.
    for (;;) {
      const me = await getMe();
      if (me) {
        set({ me, status: me.auth === 'off' || me.email ? 'in' : 'out' });
        return;
      }
      set({ status: get().status === 'checking' ? 'offline' : get().status });
      await new Promise((r) => setTimeout(r, 1000));
    }
  },

  async logout() {
    await logout();
    // Всё дело — от сервера: проще всего загрузить страницу заново (будет экран входа).
    window.location.replace(window.location.pathname);
  },
}));

// Сессии больше нет (вышли в другой вкладке) — экран входа, а не бесконечные повторы (R2-03).
setOnSignedOut(() => {
  if (useAccount.getState().me?.auth === 'link') useAccount.setState({ status: 'out', me: null });
});

/** Почта игрока, если он вошёл по ссылке (для меню и настроек). */
export const useEmail = () => useAccount((a) => (a.me?.auth === 'link' ? a.me.email : undefined));
