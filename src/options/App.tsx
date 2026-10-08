import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { MessageKey } from '../shared/i18n';
import { useLocale } from '../shared/useLocale';
import { DONATE_URL, REPO_URL } from '../shared/links';
import type { OptionsTabId } from '../shared/types';
import { GithubIcon, LogoMark, ShieldCheckIcon, SlidersIcon, UserIcon } from '../shared/ui/icons';
import { useOptionsData } from './hooks/useOptionsData';
import { BehaviorTab } from './tabs/BehaviorTab';
import { PrivacyTab } from './tabs/PrivacyTab';
import { ProfilesTab } from './tabs/ProfilesTab';

const TABS: OptionsTabId[] = ['profiles', 'behavior', 'privacy'];

const TAB_ICONS: Record<OptionsTabId, ReactNode> = {
  profiles: <UserIcon size={15} />,
  behavior: <SlidersIcon size={15} />,
  privacy: <ShieldCheckIcon size={15} />,
};

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
    return <div className="options-app" />;
  }

  return (
    <div className="options-app">
      <header className="topbar">
        <div className="topbar__inner">
          <h1 className="brand options-title">
            <span className="brand__mark">
              <LogoMark size={26} />
            </span>
            {t('app.name')}
          </h1>
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
                {TAB_ICONS[id]}
                {t(`options.tab.${id}` as MessageKey)}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="options-shell">
        <div className="page-intro" key={tab}>
          <h2 className="page-intro__title">{t(`options.tab.${tab}` as MessageKey)}</h2>
          <p className="page-intro__body">{t(`options.intro.${tab}` as MessageKey)}</p>
        </div>
        <main className="options-main">
          {tab === 'profiles' && (
            <ProfilesTab profiles={data.profiles} onPersistProfiles={data.persistProfiles} t={t} />
          )}
          {tab === 'behavior' && (
            <BehaviorTab settings={data.settings} onPersistSettings={data.persistSettings} t={t} />
          )}
          {tab === 'privacy' && <PrivacyTab t={t} />}
        </main>
        <footer className="options-footer">
          <p className="options-footer__body">{t('support.footerBody')}</p>
          <div className="options-footer__links">
            <a className="donate-link" href={DONATE_URL} target="_blank" rel="noreferrer">
              {t('support.donateLink')}
            </a>
            <a className="footer-link" href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubIcon size={15} />
              {t('support.sourceLink')}
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
