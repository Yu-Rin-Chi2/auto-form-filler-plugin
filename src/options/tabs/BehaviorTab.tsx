import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MessageKey } from '../../shared/i18n';
import type { Settings } from '../../shared/types';
import { ExternalLinkIcon, KeyboardIcon, SlidersIcon, SparklesIcon } from '../../shared/ui/icons';
import { ActionBar } from '../components/ActionBar';

type Props = {
  settings: Settings;
  onPersistSettings: (next: Settings) => Promise<void>;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

type ToggleKey = 'highlightFilled' | 'overwriteFilled' | 'previewBeforeFill' | 'debugLogging';

const TOGGLES: { id: string; key: ToggleKey; label: MessageKey }[] = [
  { id: 'highlight', key: 'highlightFilled', label: 'options.behavior.highlightLabel' },
  { id: 'overwrite', key: 'overwriteFilled', label: 'options.behavior.overwriteLabel' },
  { id: 'preview', key: 'previewBeforeFill', label: 'options.behavior.previewLabel' },
  { id: 'debug', key: 'debugLogging', label: 'options.behavior.debugLabel' },
];

export const BehaviorTab = ({ settings, onPersistSettings, t }: Props) => {
  const [draft, setDraft] = useState<Settings>(settings);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const handleSave = async () => {
    await onPersistSettings(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const openShortcuts = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  return (
    <div className="settings-stack">
      <section className="card form-section">
        <header className="form-section__header">
          <span className="form-section__icon">
            <SlidersIcon size={16} />
          </span>
          <h3 className="section-title">{t('options.behavior.group.judgement')}</h3>
        </header>
        <div className="form-field">
          <div className="range-head">
            <label className="setting-label" htmlFor="threshold">
              {t('options.behavior.thresholdLabel')}
            </label>
            <output className="value-badge" htmlFor="threshold">
              {draft.confidenceThreshold.toFixed(2)}
            </output>
          </div>
          <input
            id="threshold"
            className="range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.confidenceThreshold}
            style={{ '--range-fill': `${draft.confidenceThreshold * 100}%` } as CSSProperties}
            onChange={(e) => setDraft((d) => ({ ...d, confidenceThreshold: Number(e.target.value) }))}
          />
          <div className="range-scale" aria-hidden="true">
            <span>{t('options.behavior.thresholdLow')}</span>
            <span>{t('options.behavior.thresholdHigh')}</span>
          </div>
          <span className="form-field__hint">{t('options.behavior.thresholdHint')}</span>
        </div>
      </section>

      <section className="card form-section">
        <header className="form-section__header">
          <span className="form-section__icon">
            <SparklesIcon size={16} />
          </span>
          <h3 className="section-title">{t('options.behavior.group.fill')}</h3>
        </header>
        <div className="toggle-list">
          {TOGGLES.map(({ id, key, label }) => (
            <label key={id} className="toggle-row" htmlFor={id}>
              <span className="toggle-row__label">{t(label)}</span>
              <input
                id={id}
                className="switch"
                type="checkbox"
                role="switch"
                checked={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card form-section">
        <header className="form-section__header">
          <span className="form-section__icon">
            <KeyboardIcon size={16} />
          </span>
          <h3 className="section-title">{t('options.behavior.shortcutLabel')}</h3>
        </header>
        <div className="shortcut-row">
          <span className="shortcut-keys">
            <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>
          </span>
          <button type="button" className="button button--secondary button--small" onClick={openShortcuts}>
            {t('options.behavior.shortcutChange')}
            <ExternalLinkIcon size={13} />
          </button>
        </div>
      </section>

      <ActionBar
        savedText={savedFlash ? t('options.behavior.saved') : null}
        unsavedText={dirty ? t('common.unsaved') : null}
      >
        <button type="button" className="button button--primary" onClick={() => void handleSave()}>
          {t('options.behavior.saveButton')}
        </button>
      </ActionBar>
    </div>
  );
};
