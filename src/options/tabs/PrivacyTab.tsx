import { useCallback, useEffect, useState } from 'react';
import type { MessageKey } from '../../shared/i18n';
import { listGrantedFrameOrigins, originToHost, revokeFrameOrigin } from '../../shared/frame-permissions';
import { PRIVACY_URL, REPO_URL } from '../../shared/links';

type Props = {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

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
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 className="section-title">{t('options.privacy.sendTitle')}</h3>
      <ul className="privacy-list">
        <li>{t('options.privacy.send1')}</li>
        <li>{t('options.privacy.send2')}</li>
        <li>{t('options.privacy.send3')}</li>
      </ul>

      <h3 className="section-title">{t('options.privacy.notSendTitle')}</h3>
      <ul className="privacy-list">
        <li>{t('options.privacy.notSend1')}</li>
        <li>{t('options.privacy.notSend2')}</li>
        <li>{t('options.privacy.notSend3')}</li>
      </ul>

      <p className="hint">{t('options.privacy.storageNote')}</p>

      <h3 className="section-title">{t('options.privacy.grantedTitle')}</h3>
      <p className="hint">{t('options.privacy.grantedBody')}</p>
      {grantedOrigins.length === 0 ? (
        <p className="hint">{t('options.privacy.grantedEmpty')}</p>
      ) : (
        <ul className="privacy-list" data-testid="granted-frame-origins">
          {grantedOrigins.map((origin) => (
            <li key={origin}>
              {originToHost(origin)}{' '}
              <button type="button" className="link" onClick={() => void revoke(origin)}>
                {t('options.privacy.revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="button-row" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        <a className="link" href={PRIVACY_URL} target="_blank" rel="noreferrer">
          {t('options.privacy.policyLink')}
        </a>
        <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
          {t('options.privacy.sourceLink')}
        </a>
      </div>
    </div>
  );
};
