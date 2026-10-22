import * as React from "react";
import { ShieldOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "./inline-alert";

type AlarmDisarmDialogProps = {
  panelName: string;
  codeFormat: "number" | "text" | null;
  /** Disarms with the code; reject with a message to keep the dialog open and show it. */
  onConfirm: (code: string) => Promise<void>;
  disabled?: boolean;
  /** Open on first render (stories). */
  defaultOpen?: boolean;
};

/**
 * Disarming always asks for the alarm code. The code is sent once and forgotten: the field is cleared on
 * every open and close, and it is never stored. Only in the app; never offered to the assistant or voice.
 */
export function AlarmDisarmDialog({ panelName, codeFormat, onConfirm, disabled, defaultOpen = false }: AlarmDisarmDialogProps) {
  const { t } = useTranslation("home-assistant");
  const { t: tCommon } = useTranslation();
  const [open, setOpen] = React.useState(defaultOpen);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const change = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    setCode("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(code.trim());
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("alarm.errors.generic"));
    } finally {
      setCode("");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="destructive" disabled={disabled} className="min-h-10 flex-1 sm:flex-none">
          <ShieldOffIcon />
          {t("alarm.disarm.action")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" autoComplete="off">
          <DialogHeader>
            <DialogTitle>{t("alarm.disarm.title")}</DialogTitle>
            <DialogDescription>{t("alarm.disarm.description", { panel: panelName })}</DialogDescription>
          </DialogHeader>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alarm-disarm-code">{t("alarm.code")}</Label>
            <Input
              id="alarm-disarm-code"
              name="alarm-code"
              type="password"
              inputMode={codeFormat === "text" ? "text" : "numeric"}
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={busy}
              className="text-base"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t("alarm.disarm.logged")}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => change(false)} disabled={busy}>
              {tCommon("actions.cancel")}
            </Button>
            <Button type="submit" variant="destructive" loading={busy} disabled={!code.trim()}>
              {busy ? t("alarm.disarm.disarming") : t("alarm.disarm.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
