import { useEffect, useState } from 'react';
import type { MessageKey } from '../shared/i18n';
import { useLocale } from '../shared/useLocale';
import type { OptionsTabId } from '../shared/types';
import { useOptionsData } from './hooks/useOptionsData';
import { ApiTab } from './tabs/ApiTab';
import { BehaviorTab } from './tabs/BehaviorTab';
import { PrivacyTab } from './tabs/PrivacyTab';
import { ProfilesTab } from './tabs/ProfilesTab';

const TABS: OptionsTabId[] = ['profiles', 'api', 'behavior', 'privacy'];

function readInitialTab(): OptionsTabId {
  const hash = window.location.hash.replace('#', '');
  return (TABS as string[]).includes(hash) ? (hash as OptionsTabId) : 'profiles';
}

export const App = () => {
  const { t } = useLocale();
  const [tab, setTab] = useState<OptionsTabId>(readInitialTab);
  const data = useOptionsData();

  useEffect(() => {
    if (window.location.hash.replace('#', '') !== tab) {
      window.location.hash = tab;
    }
  }, [tab]);

  useEffect(() => {
    const onHashChange = () => setTab(readInitialTab());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!data.loaded || !data.settings) {
    return <div className="options-shell" />;
  }

  return (
    <div className="options-shell">
      <header className="options-header">
        <h1 className="options-title">{t('app.name')}</h1>
        <nav className="options-tabs" role="tablist" aria-label={t('app.name')}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`options-tab ${tab === id ? 'options-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`options.tab.${id}` as MessageKey)}
            </button>
          ))}
        </nav>
      </header>
      <main className="options-main">
        {tab === 'profiles' && (
          <ProfilesTab profiles={data.profiles} onPersistProfiles={data.persistProfiles} t={t} />
        )}
        {tab === 'api' && <ApiTab settings={data.settings} onPersistSettings={data.persistSettings} t={t} />}
        {tab === 'behavior' && (
          <BehaviorTab settings={data.settings} onPersistSettings={data.persistSettings} t={t} />
        )}
        {tab === 'privacy' && <PrivacyTab t={t} />}
      </main>
    </div>
  );
};
