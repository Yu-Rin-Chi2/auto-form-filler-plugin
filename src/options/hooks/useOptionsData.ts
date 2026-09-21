import { useCallback, useEffect, useState } from 'react';
import { getProfiles, getSettings, saveProfiles, saveSettings } from '../../shared/storage';
import type { Profile, Settings } from '../../shared/types';

export function useOptionsData() {
  const [profiles, setProfilesState] = useState<Profile[]>([]);
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, s] = await Promise.all([getProfiles(), getSettings()]);
      if (cancelled) return;
      setProfilesState(p);
      setSettingsState(s);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistProfiles = useCallback(async (next: Profile[]) => {
    setProfilesState(next);
    await saveProfiles(next);
  }, []);

  const persistSettings = useCallback(async (next: Settings) => {
    setSettingsState(next);
    await saveSettings(next);
  }, []);

  return { profiles, settings, loaded, persistProfiles, persistSettings };
}
