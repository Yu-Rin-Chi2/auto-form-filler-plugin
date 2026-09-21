/** popup / options 共通の React フック。settings.locale の変化に応じて表示言語を切り替える */
import { useCallback, useEffect, useState } from 'react';
import type { MessageKey } from './i18n';
import { resolveLocale, t as translate } from './i18n';
import { getSettings, onStorageChanged } from './storage';
import type { Locale } from './i18n';

export function useLocale(): { locale: Locale; t: (key: MessageKey, params?: Record<string, string | number>) => string } {
  const [locale, setLocale] = useState<Locale>('ja');

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (!cancelled) setLocale(resolveLocale(s.locale));
    });
    const unsubscribe = onStorageChanged((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      const newSettings = changes.settings.newValue as { locale?: Locale } | undefined;
      setLocale(resolveLocale(newSettings?.locale));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  return { locale, t };
}
