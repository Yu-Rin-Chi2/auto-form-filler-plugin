import { useEffect, useState } from 'react';
import type { MessageKey } from '../../shared/i18n';
import type { Settings } from '../../shared/types';

type Props = {
  settings: Settings;
  onPersistSettings: (next: Settings) => Promise<void>;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

export const BehaviorTab = ({ settings, onPersistSettings, t }: Props) => {
  const [draft, setDraft] = useState<Settings>(settings);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const handleSave = async () => {
    await onPersistSettings(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const openShortcuts = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="form-field">
        <label className="form-field__label" htmlFor="threshold">
          {t('options.behavior.thresholdLabel')}: {draft.confidenceThreshold.toFixed(2)}
        </label>
        <input
          id="threshold"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draft.confidenceThreshold}
          onChange={(e) => setDraft((d) => ({ ...d, confidenceThreshold: Number(e.target.value) }))}
        />
        <span className="form-field__hint">{t('options.behavior.thresholdHint')}</span>
      </div>

      <div className="checkbox-row" style={{ marginTop: 12 }}>
        <input
          id="highlight"
          type="checkbox"
          checked={draft.highlightFilled}
          onChange={(e) => setDraft((d) => ({ ...d, highlightFilled: e.target.checked }))}
        />
        <label htmlFor="highlight">{t('options.behavior.highlightLabel')}</label>
      </div>

      <div className="checkbox-row" style={{ marginTop: 8 }}>
        <input
          id="overwrite"
          type="checkbox"
          checked={draft.overwriteFilled}
          onChange={(e) => setDraft((d) => ({ ...d, overwriteFilled: e.target.checked }))}
        />
        <label htmlFor="overwrite">{t('options.behavior.overwriteLabel')}</label>
      </div>

      <div className="checkbox-row" style={{ marginTop: 8 }}>
        <input
          id="preview"
          type="checkbox"
          checked={draft.previewBeforeFill}
          onChange={(e) => setDraft((d) => ({ ...d, previewBeforeFill: e.target.checked }))}
        />
        <label htmlFor="preview">{t('options.behavior.previewLabel')}</label>
      </div>

      <div className="checkbox-row" style={{ marginTop: 8 }}>
        <input
          id="debug"
          type="checkbox"
          checked={draft.debugLogging}
          onChange={(e) => setDraft((d) => ({ ...d, debugLogging: e.target.checked }))}
        />
        <label htmlFor="debug">{t('options.behavior.debugLabel')}</label>
      </div>

      <div className="form-field" style={{ marginTop: 16 }}>
        <span className="form-field__label">{t('options.behavior.shortcutLabel')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code>Alt+Shift+F</code>
          <button type="button" className="advanced-toggle" onClick={openShortcuts}>
            {t('options.behavior.shortcutChange')}
          </button>
        </div>
      </div>

      <div className="button-row" style={{ marginTop: 20 }}>
        {savedFlash && <span className="status-text status-text--success">{t('options.behavior.saved')}</span>}
        <button type="button" className="button button--primary" onClick={() => void handleSave()}>
          {t('options.behavior.saveButton')}
        </button>
      </div>
    </div>
  );
};
