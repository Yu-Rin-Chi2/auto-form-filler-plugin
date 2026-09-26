import { useCallback, useEffect, useState } from 'react';
import type { MessageKey } from '../../shared/i18n';
import { listGrantedFrameOrigins, originToHost, revokeFrameOrigin } from '../../shared/frame-permissions';
import { PRIVACY_URL, REPO_URL } from '../../shared/links';
import {
  CheckIcon,
  ExternalLinkIcon,
  GithubIcon,
  GlobeIcon,
  LockIcon,
  SendIcon,
  ShieldCheckIcon,
  XIcon,
} from '../../shared/ui/icons';

type Props = {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const SEND_KEYS: MessageKey[] = ['options.privacy.send1', 'options.privacy.send2', 'options.privacy.send3'];
const NOT_SEND_KEYS: MessageKey[] = ['options.privacy.notSend1', 'options.privacy.notSend2', 'options.privacy.notSend3'];

export const PrivacyTab = ({ t }: Props) => {
  const [grantedOrigins, setGrantedOrigins] = useState<string[]>([]);

  const reload = useCallback(async () => {
    try {
      setGrantedOrigins(await listGrantedFrameOrigins());
    } catch {
      setGrantedOrigins([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const revoke = async (origin: string) => {
    await revokeFrameOrigin(origin);
    await reload();
  };

  return (
    <div className="settings-stack settings-stack--wide">
      <div className="privacy-grid">
        <section className="card form-section">
          <header className="form-section__header">
            <span className="form-section__icon">
              <SendIcon size={16} />
            </span>
            <h3 className="section-title">{t('options.privacy.sendTitle')}</h3>
          </header>
          <ul className="privacy-list">
            {SEND_KEYS.map((k) => (
              <li key={k} className="privacy-list__item">
                <span className="privacy-list__mark privacy-list__mark--send" aria-hidden="true">
                  <CheckIcon size={12} strokeWidth={3} />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </section>

        <section className="card form-section form-section--safe">
          <header className="form-section__header">
            <span className="form-section__icon form-section__icon--safe">
              <ShieldCheckIcon size={16} />
            </span>
            <h3 className="section-title">{t('options.privacy.notSendTitle')}</h3>
          </header>
          <ul className="privacy-list">
            {NOT_SEND_KEYS.map((k) => (
              <li key={k} className="privacy-list__item">
                <span className="privacy-list__mark privacy-list__mark--never" aria-hidden="true">
                  <XIcon size={12} strokeWidth={3} />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="callout">
        <LockIcon size={16} />
        <span>{t('options.privacy.storageNote')}</span>
      </p>

      <section className="card form-section">
        <header className="form-section__header">
          <span className="form-section__icon">
            <GlobeIcon size={16} />
          </span>
          <h3 className="section-title">{t('options.privacy.grantedTitle')}</h3>
        </header>
        <p className="hint">{t('options.privacy.grantedBody')}</p>
        {grantedOrigins.length === 0 ? (
          <p className="empty-note">{t('options.privacy.grantedEmpty')}</p>
        ) : (
          <ul className="origin-list" data-testid="granted-frame-origins">
            {grantedOrigins.map((origin) => (
              <li key={origin} className="origin-list__item">
                <GlobeIcon size={14} />
                <span className="origin-list__host">{originToHost(origin)}</span>{' '}
                <button type="button" className="button button--danger button--small" onClick={() => void revoke(origin)}>
                  {t('options.privacy.revoke')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="link-row">
        <a className="button button--secondary button--small" href={PRIVACY_URL} target="_blank" rel="noreferrer">
          {t('options.privacy.policyLink')}
          <ExternalLinkIcon size={13} />
        </a>
        <a className="button button--secondary button--small" href={REPO_URL} target="_blank" rel="noreferrer">
          <GithubIcon size={14} />
          {t('options.privacy.sourceLink')}
        </a>
      </div>
    </div>
  );
};
