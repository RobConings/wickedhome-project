import * as React from "react";
import { ArrowLeftIcon, ArrowRightIcon, CalendarClockIcon, ChevronRightIcon, Link2Icon, PaperclipIcon, RepeatIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { InlineAlert } from "@/components/shared/inline-alert";
import { SkeletonList } from "@/components/shared/loading-state";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ExpenseCategoryIcon, formatIban, formatStructuredCommunication, type ExpenseCategory } from "@/features/expenses";
import { ApiRequestError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { googleClient, type GoogleClient } from "../data/google-client";
import { shortMailDate } from "./use-match-line";
import type { MailBillSuggestion } from "../types/google";
import {
  proposeRecurringUpdates,
  proposeUpdates,
  type MailFieldUpdate,
  type MailLinkMatch,
  type MailLinkOptions,
  type MailLinkRecurring,
  type MailLinkResult,
  type MailLinkTarget,
  type MailOccurrenceOptions,
  type MailUpdateField,
  type MailValues,
  type RecurringUpdateField,
} from "../types/mail-matching";

type Tab = "matches" | "expenses" | "recurring";
type Step = { kind: "choose" } | { kind: "occurrence"; recurring: MailLinkRecurring } | { kind: "review"; target: MailLinkTarget };
type Loadable<T> = T | null | "error";

export type MailLinkDialogProps = {
  suggestion: MailBillSuggestion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After linking; `payee` is the expense's. */
  onLinked: (result: MailLinkResult, payee: string) => void;
  /** Opens straight on the review of this target (e.g. the best match). */
  initialTarget?: MailLinkTarget | null;
  client?: GoogleClient;
  /** Stories: seeded data instead of the API. */
  initialOptions?: MailLinkOptions;
  initialOccurrences?: MailOccurrenceOptions;
  initialRecurring?: MailLinkRecurring;
};

const short = shortMailDate;

/** What the review starts with: the diff's defaults; remember on when this recurring expense already is. */
function reviewDefaults(target: MailLinkTarget, mail: MailValues, rememberedRecurringId: string | null) {
  return {
    apply: new Set(proposeUpdates(target, mail).filter((row) => row.defaultOn).map((row) => row.field)),
    templateFields: new Set<RecurringUpdateField>(),
    remember: Boolean(target.recurringExpenseId) && rememberedRecurringId === target.recurringExpenseId,
  };
}

/** One expense or occurrence as a tappable row: icon, payee, date · amount, badges. */
function TargetRow({ target, onSelect, extra, selected }: { target: MailLinkTarget; onSelect?: () => void; extra?: React.ReactNode; selected?: boolean }) {
  const { t } = useTranslation("integrations");
  const locale = currentLocale();
  const content = (
    <>
      <ExpenseCategoryIcon category={target.category as ExpenseCategory} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
          <span className="truncate">{target.payee}</span>
          <span className="tabular-nums">{formatCurrency(target.amountCents, locale)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("suggestions.due", { date: short(target.dueDate) })}</span>
          {target.recurringExpenseId && (
            <Badge variant="outline" className="gap-1">
              <RepeatIcon aria-hidden="true" />
              {t("link.recurring")}
            </Badge>
          )}
          {target.paidOn && <Badge variant="secondary">{t("link.paid")}</Badge>}
          {target.expenseId === null && <Badge variant="outline">{t("link.notCreatedShort")}</Badge>}
          {extra}
        </span>
      </span>
    </>
  );
  if (!onSelect) return <div className="flex min-w-0 items-start gap-3">{content}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected && "bg-accent/60",
      )}
    >
      {content}
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function ReasonBadges({ match }: { match: MailLinkMatch }) {
  const { t } = useTranslation("integrations");
  return (
    <>
      {match.reasons
        .filter((reason) => reason !== "date")
        .map((reason) => (
          <Badge key={reason} variant={reason === "ogm" || reason === "remembered" ? "default" : "secondary"}>
            {t(`link.reasons.${reason}`)}
          </Badge>
        ))}
    </>
  );
}

/** A diff value: amounts in euros, dates, OGMs and IBANs formatted; "none" when empty. */
function useFormatValue() {
  const { t } = useTranslation("integrations");
  return (field: MailUpdateField, value: string | number | null) => {
    if (value === null || value === "") return t("link.none");
    if (field === "amount") return formatCurrency(Number(value), currentLocale());
    if (field === "dueDate") return short(String(value));
    if (field === "structuredCommunication") return /^\d{12}$/.test(String(value)) ? formatStructuredCommunication(String(value)) : String(value);
    if (field === "iban") return formatIban(String(value));
    return String(value);
  };
}

/** Checkbox rows "Amount € 225,00 → € 241,13". */
function DiffRows<F extends MailUpdateField>({
  rows,
  chosen,
  onToggle,
  disabled,
}: {
  rows: MailFieldUpdate<F>[];
  chosen: ReadonlySet<F>;
  onToggle: (field: F, on: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("integrations");
  const format = useFormatValue();
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.field}>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={chosen.has(row.field)}
              disabled={disabled}
              onChange={(event) => onToggle(row.field, event.target.checked)}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{t(`link.fields.${row.field}`)}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="break-all text-muted-foreground line-through decoration-muted-foreground/50">{format(row.field, row.before)}</span>
                <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("link.becomes")} />
                <span className="break-all font-medium tabular-nums">{format(row.field, row.after)}</span>
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Link to an existing expense" for a mail bill: pick a ranked match, search the expenses (paid ones too) or
 * pick a recurring expense and then the payment for the mail's period (created when it doesn't exist yet).
 * Then choose per field what to take over from the mail (before → after; amount, due date and OGM ticked
 * for unpaid expenses), optionally the recurring expense's payment details, and whether to always link this
 * sender to that recurring expense. Linking attaches the PDF. A multi-step flow, hence not a GeneralFormDialog.
 */
export function MailLinkDialog({
  suggestion,
  open,
  onOpenChange,
  onLinked,
  initialTarget = null,
  client = googleClient,
  initialOptions,
  initialOccurrences,
  initialRecurring,
}: MailLinkDialogProps) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const format = useFormatValue();

  const mail: MailValues = {
    payee: suggestion.payee,
    amountCents: suggestion.amountCents,
    dueDate: suggestion.dueDate,
    structuredCommunication: suggestion.structuredCommunication,
    iban: suggestion.iban,
  };
  // The parent mounts the dialog for each opening (keyed), so the state starts fresh every time.
  const initialDefaults = initialTarget ? reviewDefaults(initialTarget, mail, suggestion.rememberedRecurringId) : null;
  const [options, setOptions] = React.useState<Loadable<MailLinkOptions>>(initialOptions ?? null);
  const [reloads, setReloads] = React.useState(0);
  const [step, setStep] = React.useState<Step>(() =>
    initialTarget ? { kind: "review", target: initialTarget } : initialRecurring ? { kind: "occurrence", recurring: initialRecurring } : { kind: "choose" },
  );
  const [tab, setTab] = React.useState<Tab>("matches");
  const [occurrences, setOccurrences] = React.useState<Loadable<MailOccurrenceOptions>>(initialOccurrences ?? null);
  const [occurrenceDate, setOccurrenceDate] = React.useState<string | null>(initialOccurrences?.suggested ?? null);
  const [apply, setApply] = React.useState<Set<MailUpdateField>>(() => initialDefaults?.apply ?? new Set());
  const [templateFields, setTemplateFields] = React.useState<Set<RecurringUpdateField>>(() => initialDefaults?.templateFields ?? new Set());
  const [remember, setRemember] = React.useState(initialDefaults?.remember ?? false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialOptions) return;
    let cancelled = false;
    client
      .linkOptions(suggestion.id)
      .then((value) => {
        if (cancelled) return;
        setOptions(value);
        setTab((current) => (current === "matches" && value.matches.length === 0 ? "expenses" : current));
      })
      .catch(() => !cancelled && setOptions("error"));
    return () => {
      cancelled = true;
    };
  }, [client, suggestion.id, initialOptions, reloads]);
  const load = () => {
    setOptions(null);
    setReloads((count) => count + 1);
  };

  const ready = options !== null && options !== "error" ? options : null;
  const recurringOf = (id: string | null) => (id && ready ? (ready.recurring.find((item) => item.id === id) ?? null) : null);

  /** Review a target: tick the defaults of the diff; remember is on when this recurring expense already is. */
  const review = (target: MailLinkTarget) => {
    const defaults = reviewDefaults(target, mail, suggestion.rememberedRecurringId);
    setApply(defaults.apply);
    setTemplateFields(defaults.templateFields);
    setRemember(defaults.remember);
    setError(null);
    setStep({ kind: "review", target });
  };

  const chooseRecurring = (recurring: MailLinkRecurring) => {
    setStep({ kind: "occurrence", recurring });
    if (initialOccurrences && initialRecurring?.id === recurring.id) return;
    setOccurrences(null);
    setOccurrenceDate(null);
    client
      .occurrences(suggestion.id, recurring.id)
      .then((value) => {
        setOccurrences(value);
        setOccurrenceDate(value.suggested);
      })
      .catch(() => setOccurrences("error"));
  };

  const submit = async (target: MailLinkTarget) => {
    const rows = proposeUpdates(target, mail);
    const chosen = rows.filter((row) => apply.has(row.field));
    const rememberedBefore = suggestion.rememberedRecurringId !== null && suggestion.rememberedRecurringId === target.recurringExpenseId;
    setSaving(true);
    setError(null);
    try {
      const result = await client.linkSuggestion(suggestion.id, {
        target: target.expenseId ? { expenseId: target.expenseId } : { recurringExpenseId: target.recurringExpenseId ?? "", dueDate: target.dueDate },
        apply: chosen.map((row) => row.field),
        allowPaidChanges: chosen.some((row) => row.paidWarning),
        updateRecurring: target.recurringExpenseId ? [...templateFields] : [],
        // Only send a change: on → remember, switched off → forget, untouched → leave as it is.
        ...(target.recurringExpenseId && (remember || rememberedBefore) ? { remember } : {}),
      });
      onLinked(result, target.payee);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t("link.failed"));
    } finally {
      setSaving(false);
    }
  };

  const loading = (
    <div role="status" aria-label={t("link.loading")}>
      <SkeletonList rows={3} />
    </div>
  );
  const loadError = (onRetry: () => void) => (
    <InlineAlert tone="error">
      <span className="flex flex-wrap items-center gap-2">
        {t("link.loadError")}
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t("link.retry")}
        </Button>
      </span>
    </InlineAlert>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (step.kind === "choose") {
    body =
      options === null ? (
        loading
      ) : options === "error" ? (
        loadError(load)
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <SegmentedControl
            label={t("link.tabsLabel")}
            value={tab}
            onChange={setTab}
            size="lg"
            className="w-full [&>label]:flex-1"
            options={[
              { value: "matches", label: t("link.tabs.matches") },
              { value: "expenses", label: t("link.tabs.expenses") },
              { value: "recurring", label: t("link.tabs.recurring") },
            ]}
          />
          {tab === "matches" &&
            (options.matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("link.noMatches")}</p>
            ) : (
              <ul className="flex flex-col">
                {options.matches.map((match) => (
                  <li key={match.expenseId ?? `${match.recurringExpenseId}:${match.dueDate}`}>
                    <TargetRow target={match} onSelect={() => review(match)} extra={<ReasonBadges match={match} />} />
                  </li>
                ))}
              </ul>
            ))}
          {tab === "expenses" && (
            <GeneralList
              label={t("link.expensesLabel")}
              items={options.expenses}
              getKey={(target) => target.expenseId ?? `${target.recurringExpenseId}:${target.dueDate}`}
              renderRow={(target) => <TargetRow target={target} onSelect={() => review(target)} />}
              renderTile={(target) => (
                <Card className="p-2">
                  <TargetRow target={target} onSelect={() => review(target)} />
                </Card>
              )}
              search={{ keys: (target) => [target.payee, target.beneficiaryName ?? "", target.dueDate], placeholder: t("link.searchExpenses") }}
              defaultView="list"
              emptyState={<EmptyState icon={CalendarClockIcon} title={t("link.noExpenses")} />}
            />
          )}
          {tab === "recurring" && (
            <GeneralList
              label={t("link.recurringLabel")}
              items={options.recurring}
              getKey={(item) => item.id}
              renderRow={(item) => <RecurringRow item={item} remembered={item.id === options.rememberedRecurringId} onSelect={() => chooseRecurring(item)} />}
              renderTile={(item) => (
                <Card className="p-2">
                  <RecurringRow item={item} remembered={item.id === options.rememberedRecurringId} onSelect={() => chooseRecurring(item)} />
                </Card>
              )}
              search={{ keys: ["payee"], placeholder: t("link.searchRecurring") }}
              defaultView="list"
              emptyState={<EmptyState icon={RepeatIcon} title={t("link.noRecurring")} />}
            />
          )}
        </div>
      );
  } else if (step.kind === "occurrence") {
    const list = occurrences !== null && occurrences !== "error" ? occurrences : null;
    const picked = list?.occurrences.find((item) => item.dueDate === occurrenceDate) ?? null;
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{t("link.occurrenceTitle", { payee: step.recurring.payee })}</p>
          <p className="text-xs text-muted-foreground">{t("link.occurrenceHint")}</p>
        </div>
        {occurrences === null ? (
          loading
        ) : occurrences === "error" ? (
          loadError(() => chooseRecurring(step.recurring))
        ) : occurrences.occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("link.noOccurrences")}</p>
        ) : (
          <div role="radiogroup" aria-label={t("link.occurrenceTitle", { payee: step.recurring.payee })} className="flex flex-col divide-y rounded-lg border">
            {occurrences.occurrences.map((item) => (
              <label key={item.dueDate} className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                <input
                  type="radio"
                  name="mail-occurrence"
                  className="size-5 shrink-0 accent-primary"
                  checked={occurrenceDate === item.dueDate}
                  onChange={() => setOccurrenceDate(item.dueDate)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                    {short(item.dueDate)}
                    <span className="tabular-nums font-normal">{formatCurrency(item.amountCents, locale)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {item.dueDate === occurrences.suggested && <Badge>{t("link.suggested")}</Badge>}
                    {item.paidOn && <Badge variant="secondary">{t("link.paid")}</Badge>}
                    {item.expenseId === null && <Badge variant="outline">{t("link.notCreatedShort")}</Badge>}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {picked?.expenseId === null && <InlineAlert>{t("link.notCreated")}</InlineAlert>}
      </div>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={() => setStep({ kind: "choose" })}>
          <ArrowLeftIcon />
          {t("link.back")}
        </Button>
        <Button disabled={!picked} onClick={() => picked && review(picked)}>
          {t("link.continue")}
        </Button>
      </>
    );
  } else {
    const target = step.target;
    const rows = proposeUpdates(target, mail);
    const template = recurringOf(target.recurringExpenseId);
    const templateRows = template ? proposeRecurringUpdates(template, mail) : [];
    const paidTicked = rows.some((row) => row.paidWarning && apply.has(row.field));
    const recurringPayee = template?.payee ?? target.payee;
    body = (
      <div className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-1.5" aria-label={t("link.target")}>
          <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("link.target")}</h3>
          <Card className="p-3">
            <TargetRow target={target} extra={"reasons" in target ? <ReasonBadges match={target as MailLinkMatch} /> : null} />
          </Card>
          {target.expenseId === null && <InlineAlert>{t("link.notCreated")}</InlineAlert>}
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("link.changesTitle")}</h3>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("link.noChanges")}</p>
          ) : (
            <DiffRows
              rows={rows}
              chosen={apply}
              disabled={saving}
              onToggle={(field, on) =>
                setApply((current) => {
                  const next = new Set(current);
                  if (on) next.add(field);
                  else next.delete(field);
                  return next;
                })
              }
            />
          )}
          {target.paidOn && (
            <InlineAlert tone={paidTicked ? "error" : "info"}>{t("link.paidWarning", { date: short(target.paidOn) })}</InlineAlert>
          )}
        </section>

        {target.recurringExpenseId && templateRows.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("link.recurringTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("link.recurringHint", { payee: recurringPayee })}</p>
            <DiffRows
              rows={templateRows}
              chosen={templateFields}
              disabled={saving}
              onToggle={(field, on) =>
                setTemplateFields((current) => {
                  const next = new Set(current);
                  if (on) next.add(field);
                  else next.delete(field);
                  return next;
                })
              }
            />
          </section>
        )}

        {target.recurringExpenseId && (
          <label className="flex min-h-12 cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("link.remember", { sender: suggestion.payee, payee: recurringPayee })}</span>
              <span className="text-xs text-muted-foreground">{t("link.rememberHint")}</span>
            </span>
            <Switch checked={remember} onCheckedChange={setRemember} disabled={saving} />
          </label>
        )}

        {suggestion.attachmentName && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <PaperclipIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("link.pdf", { name: suggestion.attachmentName })}</span>
          </p>
        )}
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
      </div>
    );
    footer = (
      <>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setError(null);
            setStep({ kind: "choose" });
          }}
        >
          <ArrowLeftIcon />
          {t("link.chooseOther")}
        </Button>
        <Button loading={saving} onClick={() => void submit(target)}>
          <Link2Icon />
          {t("link.submit")}
        </Button>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="px-4 pt-5 sm:px-6">
          <DialogTitle>{t("link.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {[
              suggestion.payee,
              suggestion.amountCents !== null ? formatCurrency(suggestion.amountCents, locale) : t("suggestions.noAmount"),
              suggestion.dueDate ? t("suggestions.due", { date: short(suggestion.dueDate) }) : t("suggestions.received", { date: short(suggestion.receivedAt) }),
            ].join(" · ")}
            {suggestion.structuredCommunication ? ` · ${format("structuredCommunication", suggestion.structuredCommunication)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 sm:px-6" aria-busy={saving || undefined}>
          {body}
        </div>
        {footer && <DialogFooter className="flex-row justify-between gap-2 border-t px-4 py-3 sm:justify-between sm:px-6">{footer}</DialogFooter>}
        <span className="sr-only" aria-live="polite">
          {saving ? tCommon("loading.updating") : ""}
        </span>
      </DialogContent>
    </Dialog>
  );
}

/** A recurring expense in the "Recurring" list: payee, amount, next due date, status. */
function RecurringRow({ item, remembered, onSelect }: { item: MailLinkRecurring; remembered: boolean; onSelect: () => void }) {
  const { t } = useTranslation("integrations");
  const locale = currentLocale();
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ExpenseCategoryIcon category={item.category as ExpenseCategory} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
          <span className="truncate">{item.payee}</span>
          <span className="tabular-nums">{formatCurrency(item.amountCents, locale)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {item.nextDueDate && <span>{t("link.next", { date: short(item.nextDueDate) })}</span>}
          {item.status !== "active" && <Badge variant="secondary">{t(`link.status.${item.status}`)}</Badge>}
          {remembered && <Badge>{t("link.reasons.remembered")}</Badge>}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}