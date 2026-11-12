import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import * as React from "react";
import { LinkIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, RulerIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { IconChip } from "@/components/shared/icon-chip";
import { api, ApiRequestError } from "@/lib/api-client";
import { currentLocale } from "@/lib/i18n";
import { unitOverview, type UnitOverviewItem } from "@/types/unit-overview";
import { unitCatalogueInputSchema, type UnitCatalogue, type UnitCatalogueInput } from "@/types/unit-catalogue";
import { isStandardUnitSetting, standardUnitSetting, unitDefinitionKey, type UnitDefinition } from "@/types/units";
import { UnitFormDialog } from "./unit-form-dialog";
import { UnitLinksDialog } from "./unit-links-dialog";

const fetchCatalogue = () => api.get<UnitCatalogue>("/household/units?overview=true");
const saveCatalogue = (input: UnitCatalogueInput) => api.put<UnitCatalogue>("/household/units", input);

/** Shared list presentation; individual edits still preserve the catalogue's revision and other units. */
export function UnitCatalogueSection({ canManage, initialData, onSave = saveCatalogue }: { canManage: boolean; initialData?: UnitCatalogue; onSave?: typeof saveCatalogue }) {
  const { t } = useTranslation("units");
  const { t: common } = useTranslation();
  const [catalogue, setCatalogue] = React.useState(initialData ?? null);
  const [editing, setEditing] = React.useState<UnitDefinition | "new" | null>(null);
  const [newUnitName, setNewUnitName] = React.useState("");
  const [deleting, setDeleting] = React.useState<UnitDefinition | null>(null);
  const [exploring, setExploring] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(!initialData);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const addRef = React.useRef<HTMLButtonElement>(null);
  const linksRef = React.useRef<HTMLButtonElement>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const locale = currentLocale();
  const prefix = React.useId();
  const atUnitLimit = (catalogue?.units.filter((unit) => !isStandardUnitSetting(unit)).length ?? 0) >= 100;
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
    try { const saved = await onSave(parsed.data); setCatalogue({ ...saved, usedUnits: catalogue.usedUnits }); setConflict(false); return true; }
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
    const replacedSetting = standardUnitSetting(unit.name, false);
    const units = original ? catalogue.units.map((item) => item.name === original.name ? unit : !isStandardUnitSetting(item) && originalNames.has(unitDefinitionKey(item.referenceUnit)) ? { ...item, referenceUnit: unit.name } : item) : [...catalogue.units.filter((item) => !(isStandardUnitSetting(item) && item.name === replacedSetting?.name)), unit];
    if (await persist(units)) { setEditing(null); toast.success(t("savedUnit", { name: unit.name })); }
  }

  function edit(unit: UnitDefinition | "new", initialName = "") {
    if (document.activeElement instanceof HTMLButtonElement) returnFocus.current = document.activeElement;
    setError(null); setConflict(false); setNewUnitName(initialName); setEditing(unit);
  }
  function explore(name: string) {
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    setExploring(name);
  }
  function restoreFocus() { (returnFocus.current?.isConnected ? returnFocus.current : linksRef.current)?.focus(); }
  async function toggleTerminal(unit: UnitOverviewItem, isTerminal: boolean) {
    if (!catalogue) return;
    const definition = catalogue.units.find((item) => item.name === unit.name && !isStandardUnitSetting(item));
    const setting = standardUnitSetting(unit.name, isTerminal);
    const units = definition ? catalogue.units.map((item) => item === definition ? { ...item, isTerminal } : item) : setting ? [...catalogue.units.filter((item) => !(isStandardUnitSetting(item) && item.name === setting.name)), ...(isTerminal ? [setting] : [])] : null;
    if (units && await persist(units)) toast.success(t("terminalSaved", { name: unit.name }));
  }
  const addButton = canManage && <Button ref={addRef} disabled={busy || !catalogue || atUnitLimit} onClick={() => edit("new")}><PlusIcon />{t("add")}</Button>;
  const actions = (unit: UnitDefinition) => canManage && <DropdownMenu modal={false} onOpenChange={(open) => { if (open && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement; }}>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busy} aria-label={t("actionsFor", { name: unit.name })}><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => edit(unit)}><PencilIcon />{t("edit")}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => { setError(null); setDeleting(unit); }}><Trash2Icon />{t("remove")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
  const details = (unit: UnitOverviewItem) => <Stack gap="xs" className="min-w-0 flex-1">
    <Inline gap="none" align="baseline" wrap className="gap-x-2 gap-y-1"><button type="button" onClick={() => explore(unit.name)} className="text-left font-semibold break-words underline-offset-4 hover:underline focus-visible:underline" aria-label={t("links.forUnit", { name: unit.name })}>{unit.name}</button><span className="text-xs text-muted-foreground">{t(`sources.${unit.source}`)}</span></Inline>
    <Text size="sm" className="break-words tabular-nums">{unit.referenceUnit ? <>1 {unit.name} = {numbers.format(unit.factor)} {unit.referenceUnit}</> : t(unit.source === "used" ? "undefinedConversion" : unit.needsDefinition ? "undefinedContent" : "baseUnit")}</Text>
    <Text size="xs" tone="muted">{t(`categories.${unit.dimension ?? "other"}`)}{unit.source === "custom" && <> · {t("roundingSummary", { amount: numbers.format(unit.rounding) })}</>}</Text>
    {unit.aliases.length > 0 && <Text size="xs" tone="muted" className="break-words">{t("aliasesSummary", { names: unit.aliases.join(", ") })}</Text>}
    {canManage && unit.source !== "used" ? <Inline gap="sm" align="center" className="pt-1"><Switch id={`${prefix}-terminal-${encodeURIComponent(unit.name)}`} checked={unit.isTerminal} disabled={busy} onCheckedChange={(checked) => void toggleTerminal(unit, checked)} aria-label={t("terminalFor", { name: unit.name })} title={t("terminalHelp")} /><label htmlFor={`${prefix}-terminal-${encodeURIComponent(unit.name)}`} className="cursor-pointer text-xs text-muted-foreground">{t("terminal")}</label></Inline> : unit.isTerminal && <Text size="xs" weight="medium" className="text-section-foreground">{t("terminal")}</Text>}
  </Stack>;
  const rowActions = (unit: UnitOverviewItem) => {
    const definition = catalogue?.units.find((item) => item.name === unit.name && !isStandardUnitSetting(item));
    if (definition) return actions(definition);
    return canManage && unit.needsDefinition && <Button variant="ghost" size="icon" disabled={busy || !catalogue || atUnitLimit} onClick={() => edit("new", unit.name)} aria-label={t("defineNamed", { name: unit.name })}><PencilIcon /></Button>;
  };

  return <Stack gap="md">
    <Text size="sm" tone="muted">{t("listHint")}</Text>
    <Text size="xs" tone="muted">{t("terminalHelp")}</Text>
    {error && !editing && catalogue && <Stack gap="sm"><Text size="sm" tone="danger" role="alert">{error}</Text>{conflict && <Button variant="outline" disabled={busy} onClick={() => void reload()}>{t("reload")}</Button>}</Stack>}
    <GeneralList
      label={t("title")}
      items={catalogue ? unitOverview(catalogue.units, catalogue.usedUnits).sort((a, b) => a.name.localeCompare(b.name, locale)) : []}
      getKey={(unit) => unit.name}
      renderRow={(unit) => <Inline gap="md" align="start"><IconChip icon={RulerIcon} size="sm" />{details(unit)}{rowActions(unit)}</Inline>}
      renderTile={(unit) => <Card><Inline gap="md" align="start"><IconChip icon={RulerIcon} size="sm" />{details(unit)}{rowActions(unit)}</Inline></Card>}
      search={{ param: "unitQ", label: t("search"), keys: (unit) => [unit.name, unit.referenceUnit, ...unit.aliases] }}
      storageKey="unit-catalogue" viewParam="unitView" defaultView="list"
      actions={<><Button ref={linksRef} variant="outline" disabled={!catalogue} onClick={() => explore("")}><LinkIcon />{t("links.title")}</Button>{addButton}</>}
      loading={loading}
      error={!catalogue && error ? error : undefined}
      onRetry={() => void reload()}
      emptyState={<EmptyState icon={RulerIcon} title={t("empty")} description={t("emptyDescription")} action={addButton} />}
    />
    {canManage && editing && catalogue && <UnitFormDialog
      key={editing === "new" ? `new-${newUnitName}` : editing.name}
      unit={editing === "new" ? undefined : editing}
      initialName={newUnitName}
      units={catalogue.units}
      busy={busy} error={error} onSave={saveUnit}
      onClose={() => { if (!busy) { setEditing(null); setError(null); } }}
      onReturnFocus={restoreFocus}
      onReload={conflict ? reload : undefined}
    />}
    {exploring !== null && catalogue && <UnitLinksDialog initialUnit={exploring} units={catalogue.units} usedUnits={catalogue.usedUnits} onClose={() => setExploring(null)} onReturnFocus={restoreFocus} />}
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
  </Stack>;
}
