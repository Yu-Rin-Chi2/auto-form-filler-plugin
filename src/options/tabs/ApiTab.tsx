import { useEffect, useState } from 'react';
import type { MessageKey } from '../../shared/i18n';
import { README_URL } from '../../shared/links';
import type { JevErrorKind, JevProvider, Settings, TestConnectionResponse } from '../../shared/types';

type Props = {
  settings: Settings;
  onPersistSettings: (next: Settings) => Promise<void>;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

type TestStatus = { kind: 'idle' } | { kind: 'testing' } | { kind: 'success'; ms: number } | { kind: 'error'; message: string };

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
  frame_permission_needed: 'popup.error.frame_permission_needed',
  unknown: 'popup.error.unknown',
};

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '•'.repeat(key.length);
  return '•'.repeat(Math.min(key.length - 4, 12)) + key.slice(-4);
}

type GuideStep = { text: MessageKey; linkLabel?: MessageKey; url?: string };

const GUIDE_STEPS: Record<JevProvider, GuideStep[]> = {
  openrouter: [
    { text: 'options.api.guide.openrouter.1', linkLabel: 'options.api.guide.openrouter.1.link', url: 'https://openrouter.ai/' },
    {
      text: 'options.api.guide.openrouter.2',
      linkLabel: 'options.api.guide.openrouter.2.link',
      url: 'https://openrouter.ai/settings/credits',
    },
    {
      text: 'options.api.guide.openrouter.3',
      linkLabel: 'options.api.guide.openrouter.3.link',
      url: 'https://openrouter.ai/settings/keys',
    },
    { text: 'options.api.guide.openrouter.4' },
  ],
  typesafe: [
    { text: 'options.api.guide.typesafe.1', linkLabel: 'options.api.guide.typesafe.1.link', url: 'https://console.typesafe.ai/' },
    { text: 'options.api.guide.typesafe.2' },
    { text: 'options.api.guide.typesafe.3' },
  ],
};

export const ApiTab = ({ settings, onPersistSettings, t }: Props) => {
  const [draft, setDraft] = useState<Settings>(settings);
  const [keyVisible, setKeyVisible] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const handleTest = async () => {
    setTestStatus({ kind: 'testing' });
    const response = (await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION',
      provider: draft.provider,
      apiKey: draft.apiKey,
      model: draft.model,
      baseUrl: draft.baseUrl,
    })) as TestConnectionResponse;
    if (response.ok) {
      setTestStatus({ kind: 'success', ms: Math.round(response.latencyMs ?? 0) });
    } else {
      setTestStatus({ kind: 'error', message: t(ERROR_KEY_MAP[response.errorKind ?? 'unknown']) });
    }
  };

  const handleSave = async () => {
    await onPersistSettings(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const setProvider = (provider: JevProvider) => setDraft((d) => ({ ...d, provider }));

  const guideSteps = GUIDE_STEPS[draft.provider] ?? GUIDE_STEPS.openrouter;

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      {!settings.apiKey && (
        <div className="callout" role="status">
          <p className="callout__title">{t('options.api.noKeyTitle')}</p>
          <p className="callout__body">{t('options.api.noKeyBody')}</p>
        </div>
      )}

      <div className="form-field">
        <span className="form-field__label">{t('options.api.providerLabel')}</span>
        <div role="radiogroup" aria-label={t('options.api.providerLabel')} style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="provider"
              checked={draft.provider === 'openrouter'}
              onChange={() => setProvider('openrouter')}
            />
            OpenRouter
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="provider"
              checked={draft.provider === 'typesafe'}
              onChange={() => setProvider('typesafe')}
            />
            TypeSafe
          </label>
        </div>
      </div>

      <div className="form-field" style={{ marginTop: 12 }}>
        <label className="form-field__label" htmlFor="api-key">
          {t('options.api.keyLabel')}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* 常に編集可能。以前は readOnly + マスク文字列を value にしていたため、貼り付けても何も表示されなかった */}
          <input
            id="api-key"
            className="text-input"
            type={keyVisible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={draft.apiKey}
            placeholder={t('options.api.keyPlaceholder')}
            onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value.trim() }))}
          />
          <button
            type="button"
            className="button button--secondary button--small"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => setKeyVisible((v) => !v)}
          >
            {keyVisible ? t('options.api.hideButton') : t('options.api.showButton')}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          {settings.apiKey
            ? t('options.api.savedKeyHint', { masked: maskKey(settings.apiKey) })
            : t('options.api.keyHint')}
        </p>
      </div>

      <div className="button-row" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        <button type="button" className="button button--secondary" onClick={() => void handleTest()}>
          {testStatus.kind === 'testing' ? t('options.api.testing') : t('options.api.testButton')}
        </button>
        {testStatus.kind === 'success' && (
          <span className="status-text status-text--success">
            {t('options.api.testSuccess', { ms: testStatus.ms })}
          </span>
        )}
        {testStatus.kind === 'error' && (
          <span className="status-text status-text--error">
            {t('options.api.testFailure', { error: testStatus.message })}
          </span>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 className="section-title">{t('options.api.instructionsTitle')}</h3>
        <p className="hint" style={{ marginBottom: 6 }}>
          {t(
            draft.provider === 'openrouter'
              ? 'options.api.instructionsSub.openrouter'
              : 'options.api.instructionsSub.typesafe',
          )}
        </p>
        <ol className="guide-steps">
          {guideSteps.map((step) => (
            <li key={step.text}>
              {t(step.text)}
              {step.url && step.linkLabel && (
                <>
                  {' '}
                  <a className="link" href={step.url} target="_blank" rel="noreferrer">
                    {t(step.linkLabel)} ↗
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
        <p className="hint" style={{ marginTop: 6 }}>
          {t('options.api.guideNote')}{' '}
          <a className="link" href={README_URL} target="_blank" rel="noreferrer">
            {t('options.api.guideNote.link')} ↗
          </a>
        </p>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        ⓘ {t('options.api.privacyNote')}
      </p>

      <button
        type="button"
        className="advanced-toggle"
        style={{ marginTop: 12 }}
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? '▾' : '▸'} {t('options.api.advancedToggle')}
      </button>
      {advancedOpen && (
        <div className="form-row" style={{ marginTop: 8 }}>
          <div className="form-field">
            <label className="form-field__label" htmlFor="model-override">
              {t('options.api.modelLabel')}
            </label>
            <input
              id="model-override"
              className="text-input"
              type="text"
              value={draft.model ?? ''}
              placeholder={t('options.api.modelPlaceholder')}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value || undefined }))}
            />
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="baseurl-override">
              {t('options.api.baseUrlLabel')}
            </label>
            <input
              id="baseurl-override"
              className="text-input"
              type="text"
              value={draft.baseUrl ?? ''}
              placeholder={t('options.api.baseUrlPlaceholder')}
              onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value || undefined }))}
            />
          </div>
        </div>
      )}

      <div className="button-row" style={{ marginTop: 20 }}>
        {savedFlash && <span className="status-text status-text--success">{t('options.api.saved')}</span>}
        <button type="button" className="button button--primary" onClick={() => void handleSave()}>
          {t('options.api.saveButton')}
        </button>
      </div>
    </div>
  );
};
