import type { MessageKey } from '../../shared/i18n';

type Props = {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const REPO_URL = 'https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin';
const PRIVACY_URL = `${REPO_URL}/blob/main/PRIVACY.md`;

export const PrivacyTab = ({ t }: Props) => {
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
