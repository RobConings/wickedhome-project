import * as React from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiRequestError } from "@/lib/api-client";
import { unitCatalogueInputSchema, type UnitCatalogue, type UnitCatalogueInput } from "@/types/unit-catalogue";

const fetchCatalogue = () => api.get<UnitCatalogue>("/household/units");
const saveCatalogue = (input: UnitCatalogueInput) => api.put<UnitCatalogue>("/household/units", input);
type Draft = { name: string; referenceUnit: string; factor: string; rounding: string; aliases: string };
const draftsOf = (catalogue: UnitCatalogue): Draft[] => catalogue.units.map((unit) => ({ ...unit, factor: String(unit.factor), rounding: String(unit.rounding), aliases: unit.aliases.join(", ") }));

/** A shared catalogue: no product-specific definitions, hidden guesses or automatic stock edits. */
export function UnitCatalogueSection({ canManage, initialData, onSave = saveCatalogue }: { canManage: boolean; initialData?: UnitCatalogue; onSave?: typeof saveCatalogue }) {
  const { t } = useTranslation("units");
  const [catalogue, setCatalogue] = React.useState(initialData ?? null);
  const [drafts, setDrafts] = React.useState<Draft[]>(initialData ? draftsOf(initialData) : []);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const references = React.useId();
  const prefix = React.useId();
  React.useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    fetchCatalogue().then((result) => { if (!cancelled) { setCatalogue(result); setDrafts(draftsOf(result)); } }).catch(() => { if (!cancelled) setError(t("loadFailed")); });
    return () => { cancelled = true; };
  }, [initialData, t]);

  function change(index: number, field: keyof Draft, value: string) {
    setDrafts((previous) => previous.map((unit, row) => row === index ? { ...unit, [field]: value } : unit));
    setSaved(false); setError(null);
  }
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalogue || busy || !canManage) return;
    const parsed = unitCatalogueInputSchema.safeParse({ expectedUpdatedAt: catalogue.updatedAt, units: drafts.map((unit) => ({ ...unit, aliases: unit.aliases.split(",").map((alias) => alias.trim()).filter(Boolean) })) });
    if (!parsed.success) { setError(t("invalid")); return; }
    setBusy(true); setError(null); setSaved(false);
    try {
      const result = await onSave(parsed.data);
      setCatalogue(result); setDrafts(draftsOf(result)); setSaved(true);
    } catch (error) { setError(t(error instanceof ApiRequestError && error.status === 409 ? "conflict" : "saveFailed")); }
    finally { setBusy(false); }
  }

  if (!catalogue) return <p role={error ? "alert" : "status"}>{error ?? t("loading")}</p>;
  return <form onSubmit={(event) => void save(event)} className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    <p className="text-sm text-muted-foreground">{t("examples")}</p>
    <datalist id={references}>{[...new Set(["g", "kg", "ml", "cl", "l", "stuk", "pcs", ...drafts.map((unit) => unit.name).filter(Boolean)])].map((name) => <option key={name} value={name} />)}</datalist>
    <fieldset disabled={busy || !canManage} className="space-y-3">
      {drafts.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("empty")}</p>}
      {drafts.map((unit, index) => <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {([ ["name", "name"], ["aliases", "aliases"], ["factor", "factor"], ["referenceUnit", "reference"], ["rounding", "rounding"] ] as const).map(([field, label]) => <div key={field} className="min-w-0 space-y-1">
            <label htmlFor={`${prefix}-${index}-${field}`} className="text-sm font-medium">{t(label)}</label>
            <Input id={`${prefix}-${index}-${field}`} value={unit[field]} onChange={(event) => change(index, field, event.target.value)} list={field === "referenceUnit" ? references : undefined} inputMode={field === "factor" || field === "rounding" ? "decimal" : undefined} autoComplete="off" maxLength={field === "aliases" ? 500 : 20} />
          </div>)}
        </div>
        {unit.name && unit.factor && unit.referenceUnit && <p className="text-sm break-words">1 {unit.name} = {unit.factor} {unit.referenceUnit}</p>}
        {canManage && <Button type="button" variant="ghost" size="sm" aria-label={t("removeNamed", { name: unit.name || index + 1 })} onClick={() => { setDrafts((previous) => previous.filter((_, row) => row !== index)); setSaved(false); }}><Trash2Icon />{t("remove")}</Button>}
      </div>)}
      {canManage && <Button type="button" variant="outline" disabled={drafts.length >= 100} onClick={() => { setDrafts((previous) => [...previous, { name: "", factor: "", referenceUnit: "", rounding: "1", aliases: "" }]); setSaved(false); }}><PlusIcon />{t("add")}</Button>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm text-primary">{t("saved")}</p>}
    {canManage && <Button type="submit" loading={busy}>{t("save")}</Button>}
  </form>;
}
