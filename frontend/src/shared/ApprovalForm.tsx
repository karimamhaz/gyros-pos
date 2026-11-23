import { useState } from "react";
import { useSession } from "../app/session";
import { useI18n } from "../i18n";
import type { Approval } from "./types";
import { Button, Dialog, ErrorNote, Field, useAction } from "./ui";

interface Props {
  title: string;
  children?: React.ReactNode;
  disabled?: boolean;
  onApprove: (approval: Approval) => Promise<void>;
  onClose: () => void;
}

/** Reason, plus the Admin password when a cashier is asking. Good for one action only. */
export function ApprovalDialog({ title, children, disabled, onApprove, onClose }: Props) {
  const { t } = useI18n();
  const { session } = useSession();
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();
  const admin = session.role === "admin";
  const quick = [t("approval.mistake"), t("approval.changed_mind"), t("approval.problem")];

  return (
    <Dialog title={title} onClose={busy ? undefined : onClose}>
      {children}
      <Field label={t("approval.reason")} value={reason} onChange={setReason} maxLength={200} />
      <div className="flex gap-2 flex-wrap">
        {quick.map((text) => (
          <Button key={text} size="s" onClick={() => setReason(text)}>
            {text}
          </Button>
        ))}
      </div>
      {!admin && (
        <Field
          label={t("approval.password")}
          kind="latin"
          password
          value={password}
          onChange={setPassword}
          maxLength={100}
        />
      )}
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button size="l" disabled={busy} onClick={onClose}>
          {t("back")}
        </Button>
        <Button
          variant="primary"
          size="l"
          className="flex-1"
          disabled={busy || disabled || reason.trim().length < 2 || (!admin && !password)}
          onClick={() =>
            run(async () => {
              try {
                await onApprove({ reason: reason.trim(), password });
              } catch (e) {
                setPassword("");
                throw e;
              }
            })
          }
        >
          {t("approval.approve")}
        </Button>
      </div>
    </Dialog>
  );
}
