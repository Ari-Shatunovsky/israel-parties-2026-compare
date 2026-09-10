'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Состояние интерфейса живёт в адресной строке, а не в React: любой экран
 * можно переслать ссылкой. `useSyncExternalStore` с отдельным серверным
 * снимком избавляет от расхождения разметки при гидратации.
 */

const URL_CHANGE = 'app:urlchange';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(URL_CHANGE, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(URL_CHANGE, onChange);
  };
}

const clientSnapshot = () => window.location.search;
const serverSnapshot = () => '';

export type UrlState = {
  params: URLSearchParams;
  /** Значение параметра или `fallback`, если параметра нет. */
  get: (key: string, fallback: string) => string;
  /** Целое число из параметра в границах [min, max] или `fallback`. */
  getInt: (key: string, fallback: number, min: number, max: number) => number;
  /**
   * Записывает набор параметров. `null` удаляет параметр.
   * Адрес заменяется, а не добавляется в историю: кнопка «назад» должна
   * уводить с сайта, а не отматывать переключение чекбоксов.
   */
  set: (patch: Record<string, string | number | null>) => void;
};

export function useUrlState(): UrlState {
  const search = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const params = new URLSearchParams(search);

  const set = useCallback((patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, String(value));
    }
    const query = next.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
    window.dispatchEvent(new Event(URL_CHANGE));
  }, []);

  const get = (key: string, fallback: string) => params.get(key) ?? fallback;

  const getInt = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  return { params, get, getInt, set };
}
