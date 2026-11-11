import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { unitDefinitionSchema } from "@/types/unit-catalogue";
import { unitOverview } from "@/types/unit-overview";
import type { UnitDefinition } from "@/types/units";

type Props = { unit?: UnitDefinition; initialName?: string; units: UnitDefinition[]; busy: boolean; error: string | null; onSave: (unit: UnitDefinition) => Promise<void>; onClose: () => void; onReturnFocus?: () => void; onReload?: () => Promise<void> };

/** Edit one readable conversion; the parent validates it against all other central definitions. */
export function UnitFormDialog({ unit, initialName, units, busy, error, onSave, onClose, onReturnFocus, onReload }: Props) {
  const { t } = useTranslation("units");
  const { t: common } = useTranslation();
  const prefix = React.useId();
  const references = `${prefix}-references`;
  const [draft, setDraft] = React.useState({ name: unit?.name ?? initialName ?? "", referenceUnit: unit?.referenceUnit ?? "", factor: unit ? String(unit.factor) : "", rounding: String(unit?.rounding ?? 1), aliases: unit?.aliases.join(", ") ?? "", isTerminal: unit?.isTerminal ?? unitOverview(units).find((item) => item.name === initialName)?.isTerminal ?? false });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const amountId = `${prefix}-factor`;
  const referenceId = `${prefix}-referenceUnit`;

  function change<K extends keyof typeof draft>(field: K, value: typeof draft[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => { const next = { ...previous }; delete next[field]; return next; });
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = unitDefinitionSchema.safeParse({ ...draft, aliases: draft.aliases.split(",").map((alias) => alias.trim()).filter(Boolean) });
    if (!parsed.success) {
      const next: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        next[field] = [t(`validation.${field}`)];
      }
      setErrors(next); return;
    }
    setErrors({}); await onSave(parsed.data);
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={(event) => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }}>
      <DialogHeader><DialogTitle>{t(unit ? "editTitle" : "add")}</DialogTitle><DialogDescription>{t("formDescription")}</DialogDescription></DialogHeader>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        <fieldset disabled={busy} className="space-y-4">
          <FormField label={t("name")} htmlFor={`${prefix}-name`} errors={errors.name}>
            <Input id={`${prefix}-name`} autoFocus value={draft.name} onChange={(event) => change("name", event.target.value)} autoComplete="off" maxLength={20} placeholder={t("namePlaceholder")} />
          </FormField>
          <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
            <p className="text-sm font-medium">{t("oneUnit", { name: draft.name || t("thisUnit") })}</p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <FormField label={t("factorShort")} htmlFor={amountId} errors={errors.factor}>
                <Input id={amountId} value={draft.factor} onChange={(event) => change("factor", event.target.value)} inputMode="decimal" autoComplete="off" placeholder="75" />
              </FormField>
              <FormField label={t("reference")} htmlFor={referenceId} errors={errors.referenceUnit}>
                <Input id={referenceId} value={draft.referenceUnit} onChange={(event) => change("referenceUnit", event.target.value)} list={references} autoComplete="off" maxLength={20} placeholder="cl" />
              </FormField>
            </div>
            <datalist id={references}>{unitOverview(units).filter((item) => item.name !== unit?.name).flatMap((item) => [item.name, ...item.aliases]).map((name) => <option key={name} value={name} />)}</datalist>
          </div>
          <FormField label={t("aliases")} htmlFor={`${prefix}-aliases`} errors={errors.aliases} optionalLabel={common("form.optional")} description={t("aliasesHelp")}>
            <Input id={`${prefix}-aliases`} value={draft.aliases} onChange={(event) => change("aliases", event.target.value)} autoComplete="off" maxLength={500} />
          </FormField>
          <FormField label={t("rounding")} htmlFor={`${prefix}-rounding`} errors={errors.rounding} description={t("roundingHelp")}>
            <Input id={`${prefix}-rounding`} value={draft.rounding} onChange={(event) => change("rounding", event.target.value)} inputMode="decimal" autoComplete="off" />
          </FormField>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"><input type="checkbox" checked={draft.isTerminal} onChange={(event) => change("isTerminal", event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" /><span className="space-y-1"><span className="block text-sm font-medium">{t("terminal")}</span><span className="block text-xs text-muted-foreground">{t("terminalHelp")}</span></span></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {onReload && <Button type="button" variant="outline" disabled={busy} onClick={() => void onReload()}>{t("reload")}</Button>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{common("actions.cancel")}</Button><Button type="submit" loading={busy}>{common("actions.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
