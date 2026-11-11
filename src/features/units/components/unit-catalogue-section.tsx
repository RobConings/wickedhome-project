import * as React from "react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, RulerIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { IconChip } from "@/components/shared/icon-chip";
import { api, ApiRequestError } from "@/lib/api-client";
import { currentLocale } from "@/lib/i18n";
import { unitCatalogueInputSchema, type UnitCatalogue, type UnitCatalogueInput } from "@/types/unit-catalogue";
import { unitDefinitionKey, unitInfo, type UnitDefinition } from "@/types/units";
import { UnitFormDialog } from "./unit-form-dialog";

const fetchCatalogue = () => api.get<UnitCatalogue>("/household/units");
const saveCatalogue = (input: UnitCatalogueInput) => api.put<UnitCatalogue>("/household/units", input);

/** Shared list presentation; individual edits still preserve the catalogue's revision and other units. */
export function UnitCatalogueSection({ canManage, initialData, onSave = saveCatalogue }: { canManage: boolean; initialData?: UnitCatalogue; onSave?: typeof saveCatalogue }) {
  const { t } = useTranslation("units");
  const { t: common } = useTranslation();
  const [catalogue, setCatalogue] = React.useState(initialData ?? null);
  const [editing, setEditing] = React.useState<UnitDefinition | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<UnitDefinition | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(!initialData);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const addRef = React.useRef<HTMLButtonElement>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const locale = currentLocale();
  const numbers = React.useMemo(() => new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE", { maximumFractionDigits: 8 }), [locale]);

  React.useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    fetchCatalogue().then((result) => { if (!cancelled) { setCatalogue(result); setLoading(false); } }).catch(() => { if (!cancelled) { setError(t("loadFailed")); setLoading(false); } });
    return () => { cancelled = true; };
  }, [initialData, t]);

  async function reload() {
    if (busy) return;
    setBusy(true); setError(null); if (!catalogue) setLoading(true);
    try { setCatalogue(await fetchCatalogue()); setConflict(false); }
    catch { setError(t("loadFailed")); }
    finally { setBusy(false); setLoading(false); }
  }

  async function persist(units: UnitDefinition[]) {
    if (!catalogue || busy || !canManage) return false;
    const parsed = unitCatalogueInputSchema.safeParse({ expectedUpdatedAt: catalogue.updatedAt, units });
    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message;
      setError(t(code === "unitNameConflict" ? "nameConflict" : code === "unitReferenceInvalid" ? "referenceInvalid" : "invalid"));
      return false;
    }
    setBusy(true); setError(null);
    try { setCatalogue(await onSave(parsed.data)); setConflict(false); return true; }
    catch (error) {
      const stale = error instanceof ApiRequestError && error.status === 409;
      setConflict(stale); setError(t(stale ? "conflict" : "saveFailed")); return false;
    } finally { setBusy(false); }
  }

  async function saveUnit(unit: UnitDefinition) {
    if (!catalogue || !editing) return;
    const original = editing === "new" ? null : catalogue.units.find((item) => item.name === editing.name);
    if (editing !== "new" && !original) { setError(t("noLongerExists")); return; }
    const originalNames = new Set(original ? [original.name, ...original.aliases].map(unitDefinitionKey) : []);
    const units = original ? catalogue.units.map((item) => item.name === original.name ? unit : originalNames.has(unitDefinitionKey(item.referenceUnit)) ? { ...item, referenceUnit: unit.name } : item) : [...catalogue.units, unit];
    if (await persist(units)) { setEditing(null); toast.success(t("savedUnit", { name: unit.name })); }
  }

  function edit(unit: UnitDefinition | "new") {
    if (document.activeElement instanceof HTMLButtonElement) returnFocus.current = document.activeElement;
    setError(null); setConflict(false); setEditing(unit);
  }
  const addButton = canManage && <Button ref={addRef} disabled={busy || !catalogue || catalogue.units.length >= 100} onClick={() => edit("new")}><PlusIcon />{t("add")}</Button>;
  const actions = (unit: UnitDefinition) => canManage && <DropdownMenu modal={false} onOpenChange={(open) => { if (open && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement; }}>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busy} aria-label={t("actionsFor", { name: unit.name })}><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => edit(unit)}><PencilIcon />{t("edit")}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => { setError(null); setDeleting(unit); }}><Trash2Icon />{t("remove")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
  const details = (unit: UnitDefinition) => <div className="min-w-0 flex-1 space-y-1">
    {canManage ? <button type="button" disabled={busy} onClick={() => edit(unit)} className="text-left font-semibold break-words underline-offset-4 hover:underline focus-visible:underline" aria-label={t("editNamed", { name: unit.name })}>{unit.name}</button> : <p className="font-semibold break-words">{unit.name}</p>}
    <p className="text-sm break-words tabular-nums">1 {unit.name} = {numbers.format(unit.factor)} {unit.referenceUnit}</p>
    <p className="text-xs text-muted-foreground">{t(`categories.${unitInfo(unit.name, catalogue?.units)?.dimension ?? "other"}`)} · {t("roundingSummary", { amount: numbers.format(unit.rounding) })}</p>
    {unit.aliases.length > 0 && <p className="text-xs break-words text-muted-foreground">{t("aliasesSummary", { names: unit.aliases.join(", ") })}</p>}
  </div>;

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("listHint")}</p>
    {error && !editing && catalogue && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p>{conflict && <Button variant="outline" disabled={busy} onClick={() => void reload()}>{t("reload")}</Button>}</div>}
    <GeneralList
      label={t("title")}
      items={[...(catalogue?.units ?? [])].sort((a, b) => a.name.localeCompare(b.name, locale))}
      getKey={(unit) => unit.name}
      renderRow={(unit) => <div className="flex items-start gap-3"><IconChip icon={RulerIcon} size="sm" />{details(unit)}{actions(unit)}</div>}
      renderTile={(unit) => <Card><div className="flex items-start gap-3"><IconChip icon={RulerIcon} size="sm" />{details(unit)}{actions(unit)}</div></Card>}
      search={{ param: "unitQ", label: t("search"), keys: (unit) => [unit.name, unit.referenceUnit, ...unit.aliases] }}
      storageKey="unit-catalogue" viewParam="unitView" defaultView="list"
      actions={addButton}
      loading={loading}
      error={!catalogue && error ? error : undefined}
      onRetry={() => void reload()}
      emptyState={<EmptyState icon={RulerIcon} title={t("empty")} description={t("emptyDescription")} action={addButton} />}
    />
    {canManage && editing && catalogue && <UnitFormDialog
      key={editing === "new" ? "new" : editing.name}
      unit={editing === "new" ? undefined : editing}
      units={catalogue.units}
      busy={busy} error={error} onSave={saveUnit}
      onClose={() => { if (!busy) { setEditing(null); setError(null); } }}
      onReturnFocus={() => { (returnFocus.current?.isConnected ? returnFocus.current : addRef.current)?.focus(); }}
      onReload={conflict ? reload : undefined}
    />}
    <ConfirmDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }} returnFocusRef={returnFocus}
      title={t("deleteTitle", { name: deleting?.name })} description={t("deleteDescription")}
      confirmLabel={t("remove")} cancelLabel={common("actions.cancel")} destructive
      onConfirm={async () => {
        if (!deleting || !catalogue) return;
        const names = new Set([deleting.name, ...deleting.aliases].map(unitDefinitionKey));
        const dependents = catalogue.units.filter((item) => item.name !== deleting.name && names.has(unitDefinitionKey(item.referenceUnit)));
        if (dependents.length) { setError(t("inUse", { names: dependents.map((item) => item.name).join(", ") })); return; }
        if (await persist(catalogue.units.filter((item) => item.name !== deleting.name))) { returnFocus.current = addRef.current; toast.success(t("removedUnit", { name: deleting.name })); }
      }}
    />
  </div>;
}
