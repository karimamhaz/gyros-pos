import { useState } from "react";
import { useSession } from "../../app/session";
import { api } from "../../shared/api";
import type { AppSettings } from "../../shared/types";
import { useAction } from "../../shared/ui";

/** A draft of all settings; the rate is saved separately because it has its own history. */
export function useSettingsForm() {
  const { settings, reloadSettings } = useSession();
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const set = (part: Partial<AppSettings>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...part }));
  };
  const save = () =>
    action.run(async () => {
      const { rate, ...rest } = draft;
      if (rate !== null && rate !== settings.rate) await api.put("/settings/rate", { rate });
      await api.put("/settings", rest);
      await reloadSettings();
      setSaved(true);
    });
  return { draft, set, save, saved, ...action };
}
