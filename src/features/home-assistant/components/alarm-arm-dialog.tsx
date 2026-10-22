import * as React from "react";
import { ShieldIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "./inline-alert";

type AlarmArmDialogProps = {
  mode: "home" | "away";
  panelName: string;
  /** The panel wants the code to arm too. */
  codeRequired: boolean;
  codeFormat: "number" | "text" | null;
  /** Arms; reject with a message to keep the dialog open and show it. */
  onConfirm: (code: string | undefined) => Promise<void>;
  disabled?: boolean;
  /** Open on first render (stories). */
  defaultOpen?: boolean;
};

/** "Arm (away)" → an explicit confirmation step, with the code only when the panel asks for it. */
export function AlarmArmDialog({ mode, panelName, codeRequired, codeFormat, onConfirm, disabled, defaultOpen = false }: AlarmArmDialogProps) {
  const { t } = useTranslation("home-assistant");
  const { t: tCommon } = useTranslation();
  const [open, setOpen] = React.useState(defaultOpen);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = `alarm-arm-code-${mode}`;

  const change = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    setCode("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (codeRequired && !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(codeRequired ? code.trim() : undefined);
      setOpen(false);
      setCode("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("alarm.errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant={mode === "away" ? "default" : "outline"} disabled={disabled} className="min-h-10 flex-1 sm:flex-none">
          <ShieldIcon />
          {t(`alarm.arm.${mode}`)}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t(`alarm.arm.confirmTitle.${mode}`)}</DialogTitle>
            <DialogDescription>{t(`alarm.arm.confirmDescription.${mode}`, { panel: panelName })}</DialogDescription>
          </DialogHeader>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          {codeRequired && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{t("alarm.code")}</Label>
              <Input
                id={id}
                type="password"
                inputMode={codeFormat === "number" ? "numeric" : "text"}
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={busy}
                className="text-base"
                autoFocus
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => change(false)} disabled={busy}>
              {tCommon("actions.cancel")}
            </Button>
            <Button type="submit" loading={busy} disabled={codeRequired && !code.trim()}>
              {busy ? t("alarm.arm.arming") : t(`alarm.arm.confirm.${mode}`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
