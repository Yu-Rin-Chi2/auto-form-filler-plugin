import { useState } from 'react';
import type { MessageKey } from '../shared/i18n';
import { useLocale } from '../shared/useLocale';
import { hostFromUrl, timeAgo } from '../shared/format';
import type { JevErrorKind } from '../shared/types';
import { DetailList } from './components/DetailList';
import { usePopupState } from './hooks/usePopupState';
import { openOptions } from './openOptions';

const ERROR_KEY_MAP: Record<JevErrorKind, MessageKey> = {
  no_api_key: 'popup.error.no_api_key',
  invalid_key: 'popup.error.invalid_key',
  rate_limited: 'popup.error.rate_limited',
  network: 'popup.error.network',
  timeout: 'popup.error.timeout',
  invalid_response: 'popup.error.invalid_response',
  no_fields: 'popup.error.no_fields',
  unsupported_page: 'popup.error.unsupported_page',
  incomplete: 'popup.error.incomplete',
  unknown: 'popup.error.unknown',
};

export const App = () => {
  const { t, locale } = useLocale();
  const state = usePopupState();
  const [showDetail, setShowDetail] = useState(false);

  const header = (
    <header className="popup__header">
      <div className="popup__title">
        <span className="popup__title-dot" aria-hidden="true" />
        {t('app.name')}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={t('popup.settingsAria')}
        onClick={() => void openOptions()}
      >
        ⚙
      </button>
    </header>
  );

  if (state.phase === 'loading') {
    return (
      <div className="popup">
        {header}
      </div>
    );
  }

  if (state.phase === 'no_key') {
    return (
      <div className="popup">
        {header}
        <div className="state-card" role="status">
          <span className="state-card__icon" aria-hidden="true">
            ⚠
          </span>
          <p className="state-card__title">{t('popup.noKeyTitle')}</p>
          <p className="state-card__body">{t('popup.noKeyBody')}</p>
          <button type="button" className="button button--primary" onClick={() => void openOptions('api')}>
            {t('popup.noKeyButton')}
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'no_profile') {
    return (
      <div className="popup">
        {header}
        <div className="state-card" role="status">
          <span className="state-card__icon" aria-hidden="true">
            👤
          </span>
          <p className="state-card__title">{t('popup.noProfileTitle')}</p>
          <p className="state-card__body">{t('popup.noProfileBody')}</p>
          <button type="button" className="button button--primary" onClick={() => void openOptions('profiles')}>
            {t('popup.noProfileButton')}
          </button>
        </div>
      </div>
    );
  }

  const { result, details, running, profiles, selectedProfileId, setSelectedProfileId, runFill } = state;
  const hasError = Boolean(result?.error);

  return (
    <div className="popup">
      {header}

      <div>
        <label className="field-label" htmlFor="profile-select">
          {t('popup.profileLabel')}
        </label>
        <select
          id="profile-select"
          className="select"
          value={selectedProfileId}
          disabled={running}
          onChange={(e) => setSelectedProfileId(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="button button--primary"
        disabled={running || !selectedProfileId}
        onClick={() => void runFill()}
        aria-live="polite"
      >
        {running ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {t('popup.runningButton')}
          </>
        ) : hasError ? (
          t('popup.retryButton')
        ) : (
          t('popup.runButton')
        )}
      </button>

      {!running && !result && <p className="hint">{t('popup.shortcutHint')}</p>}

      {!running && result && hasError && (
        <div className="summary-card" role="alert" aria-live="polite">
          <p className="summary-card__error">✕ {t(ERROR_KEY_MAP[result.errorKind ?? 'unknown'])}</p>
          {result.errorKind === 'rate_limited' && (
            <a
              className="summary-card__link"
              href="https://status.typesafe.ai/"
              target="_blank"
              rel="noreferrer"
            >
              {t('popup.statusLink')}
            </a>
          )}
        </div>
      )}

      {!running && result && !hasError && (
        <div className="summary-card" role="status" aria-live="polite">
          <p className="summary-card__filled">✓ {t('popup.summaryFilled', { n: result.filled })}</p>
          {result.skippedLowConfidence > 0 && (
            <p className="summary-card__line">{t('popup.summarySkipped', { n: result.skippedLowConfidence })}</p>
          )}
          {(result.noMatch > 0 || result.excluded > 0 || result.skippedOther > 0) && (
            <p className="summary-card__line">
              {t('popup.summaryOther', {
                noMatch: result.noMatch,
                excluded: result.excluded,
                other: result.skippedOther,
              })}
            </p>
          )}
          <button type="button" className="summary-card__link" onClick={() => setShowDetail((v) => !v)}>
            {showDetail ? t('popup.detailHideButton') : t('popup.detailButton')}
          </button>
          {showDetail && <DetailList details={details} t={t} />}
        </div>
      )}

      {!running && result && !result.error && !showDetail && (
        <p className="summary-card__line" style={{ textAlign: 'center' }}>
          {t('popup.lastResultMeta', { host: hostFromUrl(result.url), ago: timeAgo(result.at, locale) })}
        </p>
      )}
    </div>
  );
};
