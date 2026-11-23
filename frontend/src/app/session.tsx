import { createContext, useContext } from "react";
import type { AppSettings, Session } from "../shared/types";

interface SessionValue {
  session: Session;
  settings: AppSettings;
  reloadSettings: () => Promise<void>;
  /** Back to the start screen after logout or a closed shift. */
  leave: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("not logged in");
  return value;
}
