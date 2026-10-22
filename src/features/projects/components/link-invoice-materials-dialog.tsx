import * as React from "react";
import { PackageCheckIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { MoneyInput } from "@/components/shared/money-input";
import { ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ProjectActionResult } from "../data/projects-loaders";
import { readProjectInvoice } from "../data/projects-requests";
import { unitPriceFor } from "../types/project-budget";
import {
  INVOICE_READ_ERRORS,
  type InvoiceReadError,
  type ProjectExpense,
  type ProjectExpenseMaterialsInput,
  type ProjectInvoiceReading,
  type ProjectMaterial,
} from "../types/projects";
import { useProjectText } from "./use-project-text";
import { EmptyNote } from "@/components/shared/empty-note";

/** A proposed match is ticked by itself from this confidence; below it, it is only shown. */
const PRE_TICK_CONFIDENCE = 0.5;
/** Below this, a ticked match says "check". */
const SURE_CONFIDENCE = 0.75;

type LinkInvoiceMaterialsDialogProps = {
  projectId: string;
  /** The invoice. */
  expense: ProjectExpense;
  /** All the project's materials; those on another invoice are left out. */
  materials: ProjectMaterial[];
  /** "Read invoice with AI" is offered (the assistant is configured). */
  invoiceReader: boolean;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Reads the invoice; defaults to the API (stories). */
  readInvoice?: (projectId: string, expenseId: string) => Promise<ProjectInvoiceReading>;
  /** Start with this reading, as if the AI had just read it (stories). */
  initialReading?: ProjectInvoiceReading;
};

type ReadState = { status: "idle" } | { status: "reading" } | { status: "failed"; code: InvoiceReadError | "generic" };

const errorCode = (error: unknown): InvoiceReadError | "generic" =>
  error instanceof ApiRequestError && (INVOICE_READ_ERRORS as readonly string[]).includes(error.code) ? (error.code as InvoiceReadError) : "generic";

/**
 * "Link materials": which of the project's materials are on this invoice (expense). Tick them, check the price
 * each cost on the invoice and compare the total with the expense; open ones become bought and the budget then
 * counts the expense once. "Read invoice with AI" reads the attached invoice, ticks the materials it found,
 * fills in the invoice prices and lists invoice lines that aren't materials yet (one click adds them). Nothing
 * is saved until the person saves. A `GeneralFormDialog` posting `materials` with the selection as JSON.
 */
export function LinkInvoiceMaterialsDialog({
  projectId,
  expense,
  materials,
  invoiceReader,
  trigger,
  open: controlledOpen,
  onOpenChange,
  readInvoice = readProjectInvoice,
  initialReading,
}: LinkInvoiceMaterialsDialogProps) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  const candidates = React.useMemo(() => {
    const rank = (material: ProjectMaterial) => (material.expenseId === expense.id ? 0 : material.bought ? 2 : 1);
    return materials.filter((material) => material.expenseId === null || material.expenseId === expense.id).sort((a, b) => rank(a) - rank(b));
  }, [materials, expense.id]);
  const linkedBefore = React.useMemo(() => candidates.filter((material) => material.expenseId === expense.id).map((material) => material.id), [candidates, expense.id]);

  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(linkedBefore));
  const [edited, setEdited] = React.useState<Record<string, number | null>>({});
  const [reading, setReading] = React.useState<ProjectInvoiceReading | null>(null);
  const [readState, setReadState] = React.useState<ReadState>({ status: "idle" });
  const [useInvoicePrices, setUseInvoicePrices] = React.useState(true);
  const [addLines, setAddLines] = React.useState<Set<number>>(new Set());
  // Remounts the amount fields when the AI or the switch changes their values (they are uncontrolled).
  const [version, setVersion] = React.useState(0);
  const abortRef = React.useRef<{ cancelled: boolean } | null>(null);

  const applyReading = React.useCallback((next: ProjectInvoiceReading) => {
    setReading(next);
    setSelected((previous) => {
      const merged = new Set(previous);
      for (const match of next.matches) if (match.confidence >= PRE_TICK_CONFIDENCE) merged.add(match.itemId);
      return merged;
    });
    setEdited({});
    setUseInvoicePrices(true);
    setAddLines(new Set());
    setVersion((value) => value + 1);
  }, []);

  // Every opening starts afresh.
  const reset = () => {
    if (abortRef.current) abortRef.current.cancelled = true;
    setSelected(new Set(linkedBefore));
    setEdited({});
    setReading(null);
    setReadState({ status: "idle" });
    setAddLines(new Set());
    setVersion((value) => value + 1);
    if (initialReading) applyReading(initialReading);
  };
  const resetRef = React.useRef(reset);
  React.useEffect(() => {
    resetRef.current = reset;
  });
  React.useEffect(() => {
    if (open) resetRef.current();
    else if (abortRef.current) abortRef.current.cancelled = true;
  }, [open]);

  const matchOf = React.useMemo(() => new Map((reading?.matches ?? []).map((match) => [match.itemId, match])), [reading]);
  const amountOf = (material: ProjectMaterial): number | null => {
    if (material.id in edited) return edited[material.id] ?? null;
    const match = matchOf.get(material.id);
    const line = match && reading ? reading.lines[match.lineIndex] : undefined;
    return useInvoicePrices && line ? line.totalCents : material.lineCents;
  };

  async function read() {
    const run = { cancelled: false };
    abortRef.current = run;
    setReadState({ status: "reading" });
    try {
      const next = await readInvoice(projectId, expense.id);
      if (run.cancelled) return;
      applyReading(next);
      setReadState({ status: "idle" });
    } catch (error) {
      if (!run.cancelled) setReadState({ status: "failed", code: errorCode(error) });
    }
  }

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleLine = (index: number) =>
    setAddLines((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const chosen = candidates.filter((material) => selected.has(material.id));
  const newLines = reading ? [...addLines].flatMap((index) => (reading.lines[index] ? [reading.lines[index]] : [])) : [];
  const linkedCents = chosen.reduce((sum, material) => sum + (amountOf(material) ?? 0), 0) + newLines.reduce((sum, line) => sum + line.totalCents, 0);
  const differenceCents = expense.amountCents - linkedCents;

  const payload: ProjectExpenseMaterialsInput = {
    itemIds: chosen.map((material) => material.id),
    prices: chosen.flatMap((material) => {
      const amount = amountOf(material);
      return amount !== null && amount !== material.lineCents ? [{ itemId: material.id, priceCents: unitPriceFor(amount, material.quantity) }] : [];
    }),
    newItems: newLines.map((line) => ({ name: line.description, quantity: line.quantity, priceCents: unitPriceFor(line.totalCents, line.quantity) })),
    markBought: true,
  };
  const busyReading = readState.status === "reading";

  // Something to save: a material or new line ticked, or materials taken off the invoice.
  const schema = z.object({
    selection: z.string().refine((value) => {
      const parsed = JSON.parse(value) as ProjectExpenseMaterialsInput;
      return parsed.itemIds.length + parsed.newItems.length > 0 || linkedBefore.length > 0;
    }, "nothingSelected"),
  });

  const aiPanel = invoiceReader && (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" fullOnMobile className="self-start" loading={busyReading} disabled={busyReading} onClick={() => void read()}>
        {!busyReading && <SparklesIcon />}
        {reading ? t("invoice.readAgain") : t("invoice.read")}
      </Button>
      {busyReading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Spinner />
          {t("invoice.reading")}
        </p>
      )}
      {readState.status === "failed" && <InlineAlert tone="error">{t(`invoice.errors.${readState.code}`)}</InlineAlert>}
      {reading && !busyReading && (
        <InlineAlert tone="info">
          {t("invoice.readResult", { name: reading.source.name, lines: reading.lines.length, matched: reading.matches.length })}
        </InlineAlert>
      )}
      {reading && reading.matches.length > 0 && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("invoice.useInvoicePrices")}</span>
          <Switch
            checked={useInvoicePrices}
            onCheckedChange={(checked) => {
              setUseInvoicePrices(checked);
              setEdited({});
              setVersion((value) => value + 1);
            }}
          />
        </label>
      )}
    </div>
  );

  const fields: GeneralFormField[] = [
    {
      name: "selection",
      type: "custom",
      label: t("invoice.materialsLabel"),
      render: ({ name }) => (
        <div className="flex flex-col gap-3">
          <input type="hidden" name={name} value={JSON.stringify(payload)} />
          {candidates.length === 0 ? (
            <EmptyNote>{t("invoice.noMaterials")}</EmptyNote>
          ) : (
            <ul className="divide-y rounded-lg border bg-card px-3">
              {candidates.map((material) => {
                const match = matchOf.get(material.id);
                const line = match && reading ? reading.lines[match.lineIndex] : undefined;
                const checkboxId = `invoice-material-${material.id}`;
                return (
                  <li key={material.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <label htmlFor={checkboxId} className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                        checked={selected.has(material.id)}
                        onChange={() => toggle(material.id)}
                        disabled={busyReading}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="break-words font-medium">
                          {material.name}
                          {material.quantity !== 1 && <span className="font-normal text-muted-foreground"> ×{material.quantity}</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {material.bought ? t("invoice.bought") : t("invoice.open")}
                          {material.expenseId === expense.id && <Badge variant="secondary">{t("invoice.onThis")}</Badge>}
                          {match && match.confidence < SURE_CONFIDENCE && <Badge variant="outline">{t("invoice.check")}</Badge>}
                        </span>
                        {line && <span className="break-words text-xs text-muted-foreground">{t("invoice.line", { line: line.description, amount: text.money(line.totalCents) })}</span>}
                      </span>
                    </label>
                    <MoneyInput
                      key={`${material.id}-${version}`}
                      className="w-full pl-7 sm:w-32 sm:pl-0"
                      defaultValueCents={amountOf(material)}
                      onValueChange={(cents) => setEdited((previous) => ({ ...previous, [material.id]: cents }))}
                      aria-label={t("invoice.amountFor", { name: material.name })}
                      placeholder="0,00"
                      disabled={busyReading}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {reading && reading.unmatchedLines.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{t("invoice.unmatchedTitle")}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAddLines(new Set(reading.unmatchedLines))}>
                  <PlusIcon />
                  {t("invoice.addAll")}
                </Button>
              </div>
              <ul className="divide-y rounded-lg border bg-card px-3">
                {reading.unmatchedLines.map((index) => {
                  const line = reading.lines[index];
                  if (!line) return null;
                  const checkboxId = `invoice-line-${index}`;
                  return (
                    <li key={index} className="py-3">
                      <label htmlFor={checkboxId} className="flex items-start gap-3">
                        <input id={checkboxId} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={addLines.has(index)} onChange={() => toggleLine(index)} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="break-words">
                            {line.description}
                            {line.quantity !== 1 && <span className="text-muted-foreground"> ×{line.quantity}</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">{t("invoice.addAsMaterial")}</span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">{text.money(line.totalCents)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <dl className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm tabular-nums">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("invoice.linkedTotal")}</dt>
              <dd className="font-medium">{text.money(linkedCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("invoice.expenseTotal")}</dt>
              <dd>{text.money(expense.amountCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("invoice.difference")}</dt>
              <dd className={cn("font-medium", differenceCents === 0 ? "text-success" : "text-warning")}>
                {differenceCents === 0 ? t("invoice.matches") : text.money(differenceCents)}
              </dd>
            </div>
          </dl>
        </div>
      ),
    },
  ];

  return (
    <GeneralFormDialog<ProjectActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (controlledOpen === undefined) setUncontrolledOpen(next);
        onOpenChange?.(next);
      }}
      title={t("invoice.title")}
      description={t("invoice.description", { payee: expense.payee, date: text.date(expense.paidOn ?? expense.dueDate), amount: text.money(expense.amountCents) })}
      contentClassName="sm:max-w-xl"
      schema={schema}
      translateError={(message) => (message === "nothingSelected" ? t("invoice.nothingSelected") : message)}
      intent="materials"
      hiddenFields={{ id: projectId, expenseId: expense.id }}
      intro={aiPanel || undefined}
      fields={fields}
      submitLabel={
        <>
          <PackageCheckIcon />
          {t("invoice.submit")}
        </>
      }
      successMessage={t("invoice.done")}
    />
  );
}
