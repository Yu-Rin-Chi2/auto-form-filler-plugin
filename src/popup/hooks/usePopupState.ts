import { useCallback, useEffect, useState } from 'react';
import { getLastResult, getLastResultDetail, getProfiles, getSettings } from '../../shared/storage';
import type { FieldOutcome, FillOutcomeMessageResponse, FillResult, Profile, Settings } from '../../shared/types';

export type PopupPhase = 'loading' | 'no_key' | 'no_profile' | 'ready';

export interface PopupState {
  phase: PopupPhase;
  profiles: Profile[];
  settings: Settings | null;
  selectedProfileId: string;
  setSelectedProfileId: (id: string) => void;
  running: boolean;
  result: FillResult | null;
  details: FieldOutcome[];
  runFill: () => Promise<void>;
}

export function usePopupState(): PopupState {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FillResult | null>(null);
  const [details, setDetails] = useState<FieldOutcome[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, s, r, d] = await Promise.all([
        getProfiles(),
        getSettings(),
        getLastResult(),
        getLastResultDetail(),
      ]);
      if (cancelled) return;
      setProfiles(p);
      setSettings(s);
      setResult(r);
      setDetails(d);
      const initialId =
        s.lastProfileId && p.some((x) => x.id === s.lastProfileId) ? s.lastProfileId : (p[0]?.id ?? '');
      setSelectedProfileId(initialId);
      setLoaded(true);
      try {
        void chrome.action.setBadgeText({ text: '' });
      } catch {
        // バッジ API が使えない環境では無視する
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runFill = useCallback(async () => {
    if (!selectedProfileId || running) return;
    setRunning(true);
    try {
      const outcome = (await chrome.runtime.sendMessage({
        type: 'FILL_REQUEST',
        profileId: selectedProfileId,
      })) as FillOutcomeMessageResponse;
      setResult(outcome.result);
      setDetails(outcome.details);
    } catch (error) {
      // service worker がアイドル終了した直後などは sendMessage 自体が reject する
      // （例: "Receiving end does not exist"）。未捕捉の rejection を残さず、
      // ポップアップにエラー状態として表示する（レビュー指摘 A-1）。
      setResult({
        url: '',
        profileId: selectedProfileId,
        at: new Date().toISOString(),
        filled: 0,
        skippedLowConfidence: 0,
        noMatch: 0,
        excluded: 0,
        skippedOther: 0,
        latencyMs: 0,
        inputTokens: 0,
        error: error instanceof Error ? error.message : String(error),
        errorKind: 'unknown',
      });
      setDetails([]);
    } finally {
      setRunning(false);
    }
  }, [selectedProfileId, running]);

  let phase: PopupPhase = 'loading';
  if (loaded) {
    if (!settings?.apiKey) phase = 'no_key';
    else if (profiles.length === 0) phase = 'no_profile';
    else phase = 'ready';
  }

  return {
    phase,
    profiles,
    settings,
    selectedProfileId,
    setSelectedProfileId,
    running,
    result,
    details,
    runFill,
  };
}
