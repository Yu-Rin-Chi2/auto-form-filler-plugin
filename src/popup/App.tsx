import { useEffect, useState } from 'react';
import type { MessageKey } from '../shared/i18n';
import { useLocale } from '../shared/useLocale';
import { hostFromUrl, timeAgo } from '../shared/format';
import { originToHost, requestFrameOrigins } from '../shared/frame-permissions';
import { DONATE_URL } from '../shared/links';
import type { FillResult, JevErrorKind } from '../shared/types';
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  GearIcon,
  GlobeIcon,
  LogoMark,
  SparklesIcon,
} from '../shared/ui/icons';
import { ProfileAvatar } from '../shared/ui/ProfileAvatar';
import { DetailList } from './components/DetailList';
import { usePopupState } from './hooks/usePopupState';
import { openOptions } from './openOptions';

const ERROR_KEY_MAP: Record<JevErrorKind, MessageKey> = {
  rate_limited: 'popup.error.rate_limited',
  network: 'popup.error.network',
  timeout: 'popup.error.timeout',
  invalid_response: 'popup.error.invalid_response',
  no_fields: 'popup.error.no_fields',
  unsupported_page: 'popup.error.unsupported_page',
  incomplete: 'popup.error.incomplete',
  frame_permission_needed: 'popup.error.frame_permission_needed',
  unknown: 'popup.error.unknown',
};

const SHORTCUT = 'Alt+Shift+F';

type T = ReturnType<typeof useLocale>['t'];

/** 「Alt+Shift+F でも実行できます」のショートカット部分をキーキャップで表示する */
const ShortcutHint = ({ text }: { text: string }) => {
  const idx = text.indexOf(SHORTCUT);
  if (idx < 0) return <p className="hint">{text}</p>;
  return (
    <p className="hint">
      {text.slice(0, idx)}
      <span className="hint__keys">
        {SHORTCUT.split('+').map((key, i) => (
          <span key={key}>
            {i > 0 && <span className="hint__plus">+</span>}
            <kbd>{key}</kbd>
          </span>
        ))}
      </span>
      {text.slice(idx + SHORTCUT.length)}
    </p>
  );
};

/** 結果の内訳（積み上げバー + 凡例）。件数 0 の区分は出さない */
const Breakdown = ({ result, t }: { result: FillResult; t: T }) => {
  const segments = [
    { key: 'filled', n: result.filled, label: t('popup.stat.filled') },
    { key: 'skipped', n: result.skippedLowConfidence, label: t('popup.stat.skipped') },
    { key: 'noMatch', n: result.noMatch, label: t('popup.stat.noMatch') },
    { key: 'excluded', n: result.excluded, label: t('popup.stat.excluded') },
    { key: 'other', n: result.skippedOther, label: t('popup.stat.other') },
  ].filter((s) => s.n > 0);
  const total = segments.reduce((sum, s) => sum + s.n, 0);
  if (total === 0) return null;

  return (
    <div className="breakdown">
      <div className="breakdown__bar" aria-hidden="true">
        {segments.map((s) => (
          <span key={s.key} className={`breakdown__seg breakdown__seg--${s.key}`} style={{ flexGrow: s.n }} />
        ))}
      </div>
      <ul className="breakdown__legend" aria-label={t('popup.breakdownAria')}>
        {segments.map((s) => (
          <li key={s.key} className="breakdown__item">
            <span className={`breakdown__dot breakdown__seg--${s.key}`} aria-hidden="true" />
            {s.label}
            <span className="breakdown__count">{s.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * 判定が長引いているか。中継先の AI はしばらく使われていないと、最初の 1 回に 30 秒ほどかかることがある。
 * 固まったと思われて閉じられないよう、一定時間を過ぎたら案内を出す
 */
const SLOW_HINT_AFTER_MS = 5000;
function useSlowRunning(running: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!running) return;
    const timer = setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [running]);
  return slow;
}

export const App = () => {
  const { t, locale } = useLocale();
  const state = usePopupState();
  const [showDetail, setShowDetail] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const slowRunning = useSlowRunning(state.running);

  const header = (
    <header className="popup__header">
      <div className="brand">
        <span className="brand__mark">
          <LogoMark size={26} />
        </span>
        {t('app.name')}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={t('popup.settingsAria')}
        title={t('popup.settingsAria')}
        onClick={() => void openOptions()}
      >
        <GearIcon size={17} />
      </button>
    </header>
  );

  if (state.phase === 'loading') {
    return (
      <div className="popup">
        {header}
        <div className="popup__body" aria-hidden="true">
          <div className="skeleton skeleton--label" />
          <div className="skeleton skeleton--field" />
          <div className="skeleton skeleton--button" />
        </div>
      </div>
    );
  }

  if (state.phase === 'no_profile') {
    return (
      <div className="popup">
        {header}
        <div className="popup__body">
          <div className="state-card" role="status">
            <EmptyIllustration />
            <p className="state-card__title">{t('popup.noProfileTitle')}</p>
            <p className="state-card__body">{t('popup.noProfileBody')}</p>
            <button
              type="button"
              className="button button--primary button--block"
              onClick={() => void openOptions('profiles')}
            >
              {t('popup.noProfileButton')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { result, details, running, profiles, selectedProfileId, setSelectedProfileId, runFill } = state;
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const hasError = Boolean(result?.error);
  const pendingOrigins = result?.pendingFrameOrigins ?? [];
  const pendingHosts = pendingOrigins.map(originToHost).join(', ');

  // 「許可して再実行」: Chrome の権限ダイアログはユーザー操作起点でしか出せないため、
  // ポップアップのクリックハンドラ内で直接 permissions.request を呼び、許可されたら再実行する
  const allowFramesAndRerun = async () => {
    setPermissionDenied(false);
    const granted = await requestFrameOrigins(pendingOrigins);
    if (granted) await runFill();
    else setPermissionDenied(true);
  };

  return (
    <div className="popup">
      {header}

      <div className="popup__body">
        <div>
          <label className="field-label" htmlFor="profile-select">
            {t('popup.profileLabel')}
          </label>
          <div className="profile-picker">
            {selectedProfile && (
              <span className="profile-picker__avatar">
                <ProfileAvatar name={selectedProfile.name} color={selectedProfile.color} size={26} />
              </span>
            )}
            <select
              id="profile-select"
              className="profile-picker__select"
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
            <ChevronDownIcon className="profile-picker__chevron" size={16} />
          </div>
        </div>

        <button
          type="button"
          className={`button button--primary button--hero ${running ? 'button--running' : ''}`}
          disabled={running || !selectedProfileId}
          onClick={() => void runFill()}
          aria-live="polite"
        >
          {running ? (
            <>
              <span className="spinner" aria-hidden="true" />
              {t('popup.runningButton')}
            </>
          ) : (
            <>
              <SparklesIcon size={17} />
              {hasError ? t('popup.retryButton') : t('popup.runButton')}
            </>
          )}
        </button>

        {!running && !result && <ShortcutHint text={t('popup.shortcutHint')} />}
        {running && slowRunning && (
          <p className="hint" role="status">
            {t('popup.slowHint')}
          </p>
        )}

        {!running && result && hasError && (
          <div className="summary-card summary-card--error" role="alert" aria-live="polite">
            <div className="summary-card__head">
              <span className="summary-card__icon summary-card__icon--error">
                <AlertIcon size={18} />
              </span>
              <p className="summary-card__error">{t(ERROR_KEY_MAP[result.errorKind ?? 'unknown'])}</p>
            </div>
            {result.errorKind === 'frame_permission_needed' && pendingOrigins.length > 0 && (
              <>
                <p className="summary-card__line">{t('popup.framePermissionBody', { hosts: pendingHosts })}</p>
                <button
                  type="button"
                  className="button button--primary button--block"
                  onClick={() => void allowFramesAndRerun()}
                >
                  {t('popup.framePermissionButton')}
                </button>
                {permissionDenied && <p className="summary-card__line">{t('popup.framePermissionDenied')}</p>}
              </>
            )}
            {result.errorKind === 'rate_limited' && (
              <a className="summary-card__link" href="https://status.typesafe.ai/" target="_blank" rel="noreferrer">
                {t('popup.statusLink')}
                <ExternalLinkIcon size={12} />
              </a>
            )}
          </div>
        )}

        {!running && result && !hasError && (
          <div className="summary-card summary-card--success" role="status" aria-live="polite">
            <div className="summary-card__head">
              <span className="summary-card__icon summary-card__icon--success">
                <CheckIcon size={18} strokeWidth={2.6} />
              </span>
              <div className="summary-card__heading">
                <p className="summary-card__filled">{t('popup.summaryFilled', { n: result.filled })}</p>
                {result.url && (
                  <p className="summary-card__meta">
                    <span className="summary-card__meta-item">
                      <GlobeIcon size={12} />
                      <span className="summary-card__host">{hostFromUrl(result.url)}</span>
                    </span>
                    <span className="summary-card__meta-item">
                      <ClockIcon size={12} />
                      {timeAgo(result.at, locale)}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <Breakdown result={result} t={t} />
            <button
              type="button"
              className="summary-card__toggle"
              aria-expanded={showDetail}
              onClick={() => setShowDetail((v) => !v)}
            >
              {showDetail ? t('popup.detailHideButton') : t('popup.detailButton')}
              <ChevronDownIcon size={14} className={showDetail ? 'rotate-180' : undefined} />
            </button>
            {showDetail && <DetailList details={details} t={t} />}
            {pendingOrigins.length > 0 && (
              <div className="summary-card__notice">
                <p className="summary-card__line">{t('popup.framePermissionHint', { hosts: pendingHosts })}</p>
                <button type="button" className="summary-card__link" onClick={() => void allowFramesAndRerun()}>
                  {t('popup.framePermissionHintButton')}
                </button>
                {permissionDenied && <p className="summary-card__line">{t('popup.framePermissionDenied')}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="popup__footer">
        <a className="popup__donate" href={DONATE_URL} target="_blank" rel="noreferrer">
          {t('support.donateLink')}
        </a>
      </footer>
    </div>
  );
};

/** プロフィール未作成時の挿絵（フォームの行 + 人物）。装飾のみ */
const EmptyIllustration = () => (
  <svg className="state-card__art" width="120" height="84" viewBox="0 0 120 84" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="empty-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2563eb" />
        <stop offset="1" stopColor="#4338ca" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="42" r="40" className="state-card__art-halo" />
    <rect x="26" y="18" width="68" height="50" rx="9" className="state-card__art-card" />
    <rect x="36" y="30" width="30" height="5" rx="2.5" className="state-card__art-line" />
    <rect x="36" y="41" width="44" height="5" rx="2.5" className="state-card__art-line" />
    <rect x="36" y="52" width="22" height="5" rx="2.5" className="state-card__art-line" />
    <circle cx="90" cy="60" r="14" fill="url(#empty-grad)" />
    <circle cx="90" cy="56" r="4.2" fill="#fff" />
    <path d="M82.5 67.5c1.6-3.6 4.4-5.3 7.5-5.3s5.9 1.7 7.5 5.3" fill="#fff" />
    <path d="M22 16l1.4 3.6L27 21l-3.6 1.4L22 26l-1.4-3.6L17 21l3.6-1.4z" fill="url(#empty-grad)" />
  </svg>
);
