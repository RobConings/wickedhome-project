import * as React from "react";
import { CheckIcon, EyeIcon, Link2Icon, MailIcon, PaperclipIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/card";
import { SkeletonList } from "@/components/shared/loading-state";
import { SectionHeader } from "@/components/shared/section-header";
import { ExpenseCategoryIcon, ExpenseFormDialog, type ExpenseCategory, type ExpenseFormDefaults } from "@/features/expenses";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { googleClient, type GoogleClient } from "../data/google-client";
import type { MailBillSuggestion } from "../types/google";
import type { MailLinkOptions, MailLinkResult, MailLinkTarget } from "../types/mail-matching";
import { MailLinkDialog } from "./mail-link-dialog";
import { MailSuggestionPreviewDialog } from "./mail-suggestion-preview-dialog";
import { useMatchLine } from "./use-match-line";

type ExpenseFormProps = Pick<React.ComponentProps<typeof ExpenseFormDialog>, "habitants" | "shops" | "payees" | "today" | "projectField">;

type MailBillSuggestionsProps = ExpenseFormProps & {
  /** Given (stories) or loaded by the component itself. */
  initial?: MailBillSuggestion[];
  client?: GoogleClient;
  /** After a mail was linked to an existing expense (which may have changed): e.g. reload the page's data. */
  onChanged?: () => void;
  /** Stories: the link dialog's data instead of the API. */
  linkOptions?: MailLinkOptions;
};

/** How many show before "Show more". */
const COLLAPSED = 3;

/** The prefilled expense for a suggestion; the person checks and completes it. */
function suggestionDefaults(suggestion: MailBillSuggestion, today: string): ExpenseFormDefaults {
  return {
    payee: suggestion.payee,
    amountCents: suggestion.amountCents ?? undefined,
    dueDate: suggestion.dueDate ?? today,
    category: suggestion.category as ExpenseCategory,
    structuredCommunication: suggestion.structuredCommunication,
    iban: suggestion.iban,
    beneficiaryName: suggestion.iban ? suggestion.payee : null,
    paymentMethod: suggestion.iban || suggestion.structuredCommunication ? "wire_transfer" : null,
  };
}

/**
 * "Suggested from mail" on the Expenses page: bills found in connected Gmail mailboxes, each with the expense
 * it probably belongs to ("Looks like: Luminus · 22/10/2026 · € 225,00 (recurring)"). *Link* attaches the mail to
 * an existing expense or a recurring expense's payment (MailLinkDialog); *View* shows the mail's text and PDF
 * next to what was found (MailSuggestionPreviewDialog), with the same actions; *Accept* opens the expense form
 * prefilled and attaches the PDF once saved; *Dismiss* hides it. Shows nothing when there is nothing to
 * suggest (or Google isn't connected).
 */
export function MailBillSuggestions({ initial, client = googleClient, onChanged, linkOptions, ...form }: MailBillSuggestionsProps) {
  const { t } = useTranslation("integrations");
  const matchLine = useMatchLine();
  const [items, setItems] = React.useState<MailBillSuggestion[] | null>(initial ?? null);
  const [expanded, setExpanded] = React.useState(false);
  const [linking, setLinking] = React.useState<{ suggestion: MailBillSuggestion; target: MailLinkTarget | null } | null>(null);
  const [viewing, setViewing] = React.useState<MailBillSuggestion | null>(null);

  React.useEffect(() => {
    if (initial) return;
    let cancelled = false;
    client
      .suggestions()
      .then(({ suggestions }) => !cancelled && setItems(suggestions))
      // Children (403), no Google, a network problem: the list simply doesn't show.
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [client, initial]);

  if (items === null) {
    return (
      <section aria-busy="true" aria-label={t("suggestions.loading")}>
        <SkeletonList rows={1} />
      </section>
    );
  }
  if (items.length === 0) return null;

  const remove = (id: string) => setItems((list) => list?.filter((item) => item.id !== id) ?? null);
  const dismiss = (suggestion: MailBillSuggestion) => {
    remove(suggestion.id);
    client
      .dismissSuggestion(suggestion.id)
      .then(() => toast.success(t("suggestions.dismissed")))
      .catch(() => {
        setItems((list) => (list ? [suggestion, ...list] : list));
        toast.error(t("google.loadError"));
      });
  };
  const accepted = (suggestion: MailBillSuggestion, expenseId: string) => {
    remove(suggestion.id);
    client
      .acceptSuggestion(suggestion.id, expenseId)
      .then((result) => (result.attached ? toast.success(t("suggestions.accepted")) : toast.warning(t("suggestions.attachFailed"))))
      .catch(() => toast.warning(t("suggestions.attachFailed")));
  };
  const linked = (suggestion: MailBillSuggestion, result: MailLinkResult, payee: string) => {
    remove(suggestion.id);
    if (result.attached) toast.success(t("link.linked", { payee }));
    else toast.warning(t("link.linkedNoPdf", { payee }));
    onChanged?.();
  };

  /** Dismiss, Link and Accept for one suggestion: on its card and under its preview. */
  const actionsFor = (suggestion: MailBillSuggestion) => {
    const best = suggestion.matches[0] ?? null;
    const strong = best?.strong === true;
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setViewing(null);
            dismiss(suggestion);
          }}
        >
          <XIcon />
          {t("suggestions.dismiss")}
        </Button>
        <Button
          variant={strong ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setViewing(null);
            setLinking({ suggestion, target: strong ? best : null });
          }}
        >
          <Link2Icon />
          {t("link.action")}
        </Button>
        <ExpenseFormDialog
          {...form}
          defaults={suggestionDefaults(suggestion, form.today)}
          action="/expenses"
          onSaved={(expenseId) => {
            setViewing(null);
            accepted(suggestion, expenseId);
          }}
          trigger={
            <Button size="sm" variant={strong ? "outline" : "default"}>
              <CheckIcon />
              {t(strong ? "suggestions.acceptNew" : "suggestions.accept")}
            </Button>
          }
        />
      </>
    );
  };

  const visible = expanded ? items : items.slice(0, COLLAPSED);
  const locale = currentLocale();
  const short = (value: string) => formatDate(value, locale);

  return (
    <section aria-labelledby="mail-suggestions-title" className="flex flex-col gap-3">
      <SectionHeader id="mail-suggestions-title" title={t("suggestions.title")} description={t("suggestions.description")} attention />
      <ul className="flex flex-col gap-2">
        {visible.map((suggestion) => {
          const best = suggestion.matches[0] ?? null;
          const strong = best?.strong === true;
          return (
            <li key={suggestion.id}>
              <Card tone="attention" className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <ExpenseCategoryIcon category={suggestion.category as ExpenseCategory} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                      {suggestion.payee}
                      <span className="tabular-nums">
                        {suggestion.amountCents !== null ? formatCurrency(suggestion.amountCents, locale) : <span className="font-normal text-muted-foreground">{t("suggestions.noAmount")}</span>}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[suggestion.dueDate ? t("suggestions.due", { date: short(suggestion.dueDate) }) : null, t("suggestions.received", { date: short(suggestion.receivedAt) })]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <MailIcon className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t("suggestions.fromMailbox", { name: suggestion.mailboxOwner })}</span>
                      {suggestion.attachmentName && (
                        <>
                          <PaperclipIcon className="ml-1 size-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{suggestion.attachmentName}</span>
                        </>
                      )}
                    </span>
                    {best && (
                      <button
                        type="button"
                        onClick={() => setLinking({ suggestion, target: best })}
                        className="mt-1 flex min-h-8 w-fit max-w-full items-center gap-1.5 rounded-md text-left text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <Link2Icon className={strong ? "size-3.5 shrink-0 text-primary" : "size-3.5 shrink-0 text-muted-foreground"} aria-hidden="true" />
                        <span className={strong ? "font-medium" : "text-muted-foreground"}>
                          {t(strong ? "link.looksLike" : "link.maybe", { target: matchLine(best) })}
                        </span>
                        {best.reasons.includes("remembered") && <Badge className="shrink-0">{t("link.reasons.remembered")}</Badge>}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setViewing(suggestion)}>
                    <EyeIcon />
                    {t("suggestions.view")}
                  </Button>
                  {actionsFor(suggestion)}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {items.length > COLLAPSED && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setExpanded((value) => !value)}>
          {expanded ? t("suggestions.showLess") : t("suggestions.showAll", { count: items.length - COLLAPSED })}
        </Button>
      )}
      <MailSuggestionPreviewDialog
        suggestion={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        actions={viewing ? actionsFor(viewing) : null}
        client={client}
      />
      {linking && (
        <MailLinkDialog
          key={linking.suggestion.id}
          suggestion={linking.suggestion}
          initialTarget={linking.target}
          open
          onOpenChange={(open) => !open && setLinking(null)}
          onLinked={(result, payee) => linked(linking.suggestion, result, payee)}
          client={client}
          initialOptions={linkOptions}
        />
      )}
    </section>
  );
}
