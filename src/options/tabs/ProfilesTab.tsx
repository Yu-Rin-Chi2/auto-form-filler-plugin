import { useEffect, useRef, useState } from 'react';
import type { MessageKey } from '../../shared/i18n';
import { buildExportPayload, createProfile, duplicateProfile, safeParseJson, validateImportPayload } from '../../shared/profile-schema';
import type { Profile, ProfileExport } from '../../shared/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProfileForm } from '../components/ProfileForm';

type Props = {
  profiles: Profile[];
  onPersistProfiles: (next: Profile[]) => Promise<void>;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

export const ProfilesTab = ({ profiles, onPersistProfiles, t }: Props) => {
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.id ?? '');
  const [draft, setDraft] = useState<Profile | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ data: ProfileExport; duplicateIds: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profiles.some((p) => p.id === selectedId)) {
      setSelectedId(profiles[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  useEffect(() => {
    const found = profiles.find((p) => p.id === selectedId);
    setDraft(found ? { ...found, fields: { ...found.fields } } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleAdd = async () => {
    const created = createProfile(t('options.profiles.defaultName'));
    await onPersistProfiles([...profiles, created]);
    setSelectedId(created.id);
  };

  const handleDuplicate = async () => {
    if (!draft) return;
    const source = profiles.find((p) => p.id === draft.id) ?? draft;
    const copy = duplicateProfile(source, t('options.profiles.duplicateSuffix'));
    await onPersistProfiles([...profiles, copy]);
    setSelectedId(copy.id);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmingDeleteId) return;
    await onPersistProfiles(profiles.filter((p) => p.id !== confirmingDeleteId));
    setConfirmingDeleteId(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    const updated: Profile = { ...draft, updatedAt: new Date().toISOString() };
    const next = profiles.some((p) => p.id === updated.id)
      ? profiles.map((p) => (p.id === updated.id ? updated : p))
      : [...profiles, updated];
    await onPersistProfiles(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const handleExport = () => {
    const payload = buildExportPayload(profiles);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto-form-filler-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const raw = safeParseJson(text);
    if (raw === null) {
      setImportError(t('options.profiles.importError', { error: 'JSON parse error' }));
      return;
    }
    const result = validateImportPayload(raw, profiles);
    if (!result.valid) {
      setImportError(t('options.profiles.importError', { error: result.error }));
      return;
    }
    setImportError(null);
    setPendingImport({ data: result.data, duplicateIds: result.duplicateIds });
  };

  const applyImport = async (mode: 'add' | 'replace') => {
    if (!pendingImport) return;
    const incoming = pendingImport.data.profiles;
    let next: Profile[];
    if (mode === 'replace') {
      next = incoming;
    } else {
      const merged = [...profiles];
      for (const p of incoming) {
        const idx = merged.findIndex((m) => m.id === p.id);
        if (idx >= 0) merged[idx] = p;
        else merged.push(p);
      }
      next = merged;
    }
    await onPersistProfiles(next);
    setPendingImport(null);
    setSelectedId(next[0]?.id ?? '');
  };

  return (
    <div className="profiles-layout">
      <aside className="profiles-sidebar">
        <ul className="profile-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`profile-list-item ${p.id === selectedId ? 'profile-list-item--active' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="color-dot" style={{ background: p.color }} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        {profiles.length === 0 && <p className="hint">{t('options.profiles.empty')}</p>}
        <button type="button" className="button button--secondary button--small" onClick={() => void handleAdd()}>
          {t('options.profiles.addButton')}
        </button>

        <div className="button-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => fileInputRef.current?.click()}
          >
            {t('options.profiles.importButton')}
          </button>
          <button type="button" className="button button--secondary button--small" onClick={handleExport}>
            {t('options.profiles.exportButton')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
        {importError && <p className="status-text status-text--error">{importError}</p>}
        {pendingImport && (
          <div className="card">
            <p>{t('options.profiles.importConfirm')}</p>
            {pendingImport.duplicateIds.length > 0 && (
              <p className="hint">
                {t('options.profiles.importDuplicateWarning', { n: pendingImport.duplicateIds.length })}
              </p>
            )}
            <div className="button-row">
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => void applyImport('add')}
              >
                {t('options.profiles.importModeAdd')}
              </button>
              <button
                type="button"
                className="button button--primary button--small"
                onClick={() => void applyImport('replace')}
              >
                {t('options.profiles.importModeReplace')}
              </button>
            </div>
          </div>
        )}
      </aside>

      {draft && (
        <div style={{ flex: 1, minWidth: 320 }}>
          <ProfileForm draft={draft} onChange={setDraft} t={t} />
          <div className="button-row" style={{ marginTop: 16 }}>
            {savedFlash && <span className="status-text status-text--success">{t('options.profiles.saved')}</span>}
            <button type="button" className="button button--secondary" onClick={() => void handleDuplicate()}>
              {t('options.profiles.duplicateButton')}
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => setConfirmingDeleteId(draft.id)}
            >
              {t('options.profiles.deleteButton')}
            </button>
            <button type="button" className="button button--primary" onClick={() => void handleSave()}>
              {t('options.profiles.saveButton')}
            </button>
          </div>
        </div>
      )}

      {confirmingDeleteId && (
        <ConfirmDialog
          message={t('options.profiles.deleteConfirm')}
          confirmLabel={t('options.profiles.deleteConfirmOk')}
          cancelLabel={t('options.profiles.deleteConfirmCancel')}
          onConfirm={() => void handleDeleteConfirmed()}
          onCancel={() => setConfirmingDeleteId(null)}
        />
      )}
    </div>
  );
};
