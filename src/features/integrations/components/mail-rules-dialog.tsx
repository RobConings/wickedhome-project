import * as React from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { FormField } from "@/components/shared/form-field";
import { SkeletonList } from "@/components/shared/loading-state";
import { CategorySelect, type ExpenseCategory } from "@/features/expenses";
import { ApiRequestError } from "@/lib/api-client";
import type { GoogleClient } from "../data/google-client";
import { mailBillRuleInputSchema, type MailBillRule, type MailBillRuleInput } from "../types/google";

type Draft = { id: string | null; payee: string; senders: string; category: ExpenseCategory };

const toDraft = (rule?: MailBillRule): Draft => ({
  id: rule?.id ?? null,
  payee: rule?.payee ?? "",
  senders: rule?.senders.join("\n") ?? "",
  category: (rule?.category as ExpenseCategory | undefined) ?? "energy",
});

/**
 * The sender rules for bill suggestions (household-wide): which senders are bills of which payee, in which
 * category. Built-in Belgian providers come pre-filled and stay editable; switch one off instead of deleting it.
 */
export function MailRulesDialog({ client, trigger }: { client: GoogleClient; trigger: React.ReactElement }) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [rules, setRules] = React.useState<MailBillRule[] | null | "error">(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setRules(null);
    client
      .rules()
      .then(setRules)
      .catch(() => setRules("error"));
  }, [client]);

  const onOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    setDraft(null);
    if (next) load();
  };

  const toggle = (rule: MailBillRule, enabled: boolean) => {
    if (!Array.isArray(rules)) return;
    setRules(rules.map((item) => (item.id === rule.id ? { ...item, enabled } : item)));
    client.updateRule(rule.id, { payee: rule.payee, senders: rule.senders, category: rule.category, enabled }).catch(() => {
      setRules((list) => (Array.isArray(list) ? list.map((item) => (item.id === rule.id ? rule : item)) : list));
      toast.error(tCommon("errors.generic"));
    });
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const current = Array.isArray(rules) ? rules.find((rule) => rule.id === draft.id) : undefined;
    const parsed = mailBillRuleInputSchema.safeParse({
      payee: draft.payee,
      senders: draft.senders.split(/[\s,;]+/).filter(Boolean),
      category: draft.category,
      enabled: current?.enabled ?? true,
    });
    if (!parsed.success) {
      const next: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "_");
        (next[key] ??= []).push(issue.message === "invalidSender" ? t("google.rules.invalidSender") : issue.message);
      }
      setErrors(next);
      return;
    }
    const input: MailBillRuleInput = parsed.data;
    setSaving(true);
    (draft.id ? client.updateRule(draft.id, input) : client.createRule(input))
      .then((saved) => {
        setRules((list) =>
          Array.isArray(list) ? (draft.id ? list.map((item) => (item.id === saved.id ? saved : item)) : [...list, saved]) : list,
        );
        setDraft(null);
        setErrors({});
        toast.success(t("google.rules.saved"));
      })
      .catch((error: unknown) => {
        if (error instanceof ApiRequestError && error.fields) setErrors(error.fields);
        else toast.error(tCommon("errors.generic"));
      })
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("google.rules.title")}</DialogTitle>
          <DialogDescription>{t("google.rules.description")}</DialogDescription>
        </DialogHeader>

        {draft ? (
          <form onSubmit={save} noValidate className="flex flex-col gap-4">
            <fieldset disabled={saving} className="contents">
              <FormField label={t("google.rules.payee")} htmlFor="mail-rule-payee" errors={errors.payee}>
                <Input id="mail-rule-payee" value={draft.payee} maxLength={80} onChange={(event) => setDraft({ ...draft, payee: event.target.value })} />
              </FormField>
              <FormField label={t("google.rules.senders")} htmlFor="mail-rule-senders" description={t("google.rules.sendersHint")} errors={errors.senders}>
                <Textarea
                  id="mail-rule-senders"
                  value={draft.senders}
                  rows={3}
                  inputMode="email"
                  className="text-base sm:text-sm"
                  onChange={(event) => setDraft({ ...draft, senders: event.target.value })}
                />
              </FormField>
              <FormField label={t("google.rules.category")} htmlFor="mail-rule-category" errors={errors.category}>
                <CategorySelect id="mail-rule-category" value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  {tCommon("actions.cancel")}
                </Button>
                <Button type="submit" loading={saving}>
                  {tCommon("actions.save")}
                </Button>
              </div>
            </fieldset>
          </form>
        ) : rules === null ? (
          <SkeletonList rows={4} />
        ) : rules === "error" ? (
          <ErrorState title={tCommon("errors.generic")} action={<Button variant="outline" onClick={load}>{tCommon("actions.retry")}</Button>} className="py-6" />
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col divide-y rounded-lg border">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 p-2.5">
                  <Switch checked={rule.enabled} onCheckedChange={(enabled) => toggle(rule, enabled)} aria-label={t("google.rules.enable", { payee: rule.payee })} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {rule.payee}
                      {rule.builtIn && <Badge variant="secondary">{t("google.rules.builtIn")}</Badge>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{rule.senders.join(", ")}</span>
                  </span>
                  <Button variant="ghost" size="icon" aria-label={tCommon("actions.edit")} onClick={() => { setErrors({}); setDraft(toDraft(rule)); }}>
                    <PencilIcon />
                  </Button>
                  {!rule.builtIn && (
                    <DeleteConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={tCommon("actions.delete")}>
                          <Trash2Icon />
                        </Button>
                      }
                      title={t("google.rules.deleteTitle", { payee: rule.payee })}
                      onConfirm={() =>
                        client
                          .deleteRule(rule.id)
                          .then(() => setRules((list) => (Array.isArray(list) ? list.filter((item) => item.id !== rule.id) : list)))
                          .catch(() => toast.error(tCommon("errors.generic")))
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-fit" onClick={() => { setErrors({}); setDraft(toDraft()); }}>
              <PlusIcon />
              {t("google.rules.add")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
