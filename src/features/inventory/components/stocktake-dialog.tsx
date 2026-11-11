import { RecordImage } from "@/components/shared/record-image";
import * as React from "react";
import { ArrowLeftIcon, CheckIcon, ClipboardCheckIcon, MapPinIcon, PackageIcon, ShoppingCartIcon, TrophyIcon, SparklesIcon, XIcon } from "lucide-react";
import { Link, useLocation } from "react-router";
import { internalOrigin } from "@/lib/record-navigation";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api-client";
import { currentLocale } from "@/lib/i18n";
import { formatQuantity } from "@/features/shopping";
import { fetchStock, saveStockCount, saveStockCountExclusion } from "../data/inventory-requests";
import { addStocktakeShoppingItem, type StocktakeShoppingResult } from "../data/stocktake-shopping";
import { stockCountInputSchema, type StockItem } from "../types/inventory";
import { excludedFromStocktake, stocktakeItems, type StocktakeItem, type StocktakeProduct } from "../types/stocktake";

type Entry = StocktakeItem & { originalQuantity: number };
type Answer = { quantity: number } | { skipped: true } | { excluded: true };
type Props = {
  items: StockItem[];
  products?: StocktakeProduct[];
  onChanged?: () => void | Promise<unknown>;
  onSave?: typeof saveStockCount;
  onReload?: (item: StockItem) => Promise<StockItem[]>;
  onSetExclusion?: typeof saveStockCountExclusion;
  onAddToShopping?: (item: StockItem, quantity: number) => Promise<StocktakeShoppingResult>;
  defaultOpen?: boolean;
  images?: Record<string, string | null>;
};

/** Physical counts replace one location's quantity; blank/skip never means zero. Saves each step. */
export function StocktakeScreen({ items, products = [], images = {}, onChanged, onSave = saveStockCount, onSetExclusion = saveStockCountExclusion, onAddToShopping, onReload = (item) => fetchStock({ productId: item.productId, placeId: item.placeId }) }: Props) {
  const { t } = useTranslation("inventory");
  const locale = currentLocale();
  const location = useLocation();
  const origin = internalOrigin(new URLSearchParams(location.search).get("from"));
  const returnTo = origin && origin !== `${location.pathname}${location.search}` ? origin : "/inventory";
  const [placeId, setPlaceId] = React.useState("all");
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [queue, setQueue] = React.useState<Entry[]>([]);
  const [index, setIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [updated, setUpdated] = React.useState<Record<string, StockItem>>({});
  const [shoppingFor, setShoppingFor] = React.useState<string | null>(null);
  const [shoppingQuantity, setShoppingQuantity] = React.useState("1");
  const [shoppingAdded, setShoppingAdded] = React.useState<Record<string, StocktakeShoppingResult>>({});
  const input = React.useRef<HTMLInputElement>(null);
  const quantityId = React.useId();
  const errorId = React.useId();
  const shoppingQuantityId = React.useId();
  const current = queue[index];
  const finished = started && !current;
  const stock = stocktakeItems(items.map((item) => updated[item.id] && updated[item.id]!.updatedAt >= item.updatedAt ? updated[item.id]! : item), products);
  const places = [...new Map(stock.map((item) => [item.placeId, item.placeName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const scoped = stock.filter((item) => placeId === "all" || item.placeId === placeId);
  const excludedItems = scoped.filter(excludedFromStocktake);
  const available = scoped.filter((item) => !excludedFromStocktake(item) && (!inStockOnly || item.quantity > 0));
  const counted = Object.values(answers).filter((answer) => "quantity" in answer).length;
  const skipped = Object.values(answers).filter((answer) => "skipped" in answer).length;
  const excluded = Object.values(answers).filter((answer) => "excluded" in answer).length;
  const changed = queue.filter((item) => {
    const answer = answers[item.id];
    return answer && "quantity" in answer && answer.quantity !== item.originalQuantity;
  }).length;

  React.useEffect(() => {
    if (started && current && !saving) { input.current?.focus(); input.current?.select(); }
  }, [index, started, saving, current]);

  function start() {
    setQueue(available.map((item) => ({ ...item, originalQuantity: item.quantity })).sort((a, b) => a.placeName.localeCompare(b.placeName) || a.productName.localeCompare(b.productName)));
    setAnswers({}); setIndex(0); setDraft(""); setError(null); setStarted(true);
  }

  function move(next: number) {
    setIndex(next);
    const answer = queue[next] && answers[queue[next]!.id];
    setDraft(answer && "quantity" in answer ? String(answer.quantity) : "");
    setError(null);
    setShoppingFor(null);
  }

  function remember(item: StockItem) {
    setUpdated((previous) => ({ ...previous, [item.id]: item }));
    setQueue((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, ...item } : entry));
  }

  async function handleError(error: unknown, item: StockItem, fallback: string) {
    if (error instanceof ApiRequestError && error.status === 409) {
      try {
        const latest = (await onReload(item)).find((entry) => entry.id === item.id);
        if (latest) remember(latest);
      } catch { /* The revision check still prevents overwriting a concurrent change. */ }
      setError(t("count.conflict"));
    } else setError(t(fallback));
  }

  async function setExclusion(item: StockItem, value: boolean) {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const result = await onSetExclusion(item.id, { excluded: value, expectedUpdatedAt: item.updatedAt });
      remember(result);
      if (value && started) {
        setAnswers((previous) => ({ ...previous, [item.id]: { excluded: true } }));
        move(index + 1);
      } else if (started) {
        setAnswers((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
      }
      void Promise.resolve().then(() => onChanged?.()).catch(() => undefined);
    } catch (error) { await handleError(error, item, "count.exclusionFailed"); }
    finally { setSaving(false); }
  }

  async function addToShopping() {
    if (!current || saving || shoppingAdded[current.productId]) return;
    const quantity = Number(shoppingQuantity.replace(",", "."));
    if (!shoppingQuantity.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) { setError(t("count.shoppingInvalid")); return; }
    setSaving(true); setError(null);
    try {
      const result = await (onAddToShopping ? onAddToShopping(current, quantity) : addStocktakeShoppingItem(current, quantity, products));
      setShoppingAdded((previous) => ({ ...previous, [current.productId]: result }));
      setShoppingFor(null);
    } catch { setError(t("count.shoppingFailed")); }
    finally { setSaving(false); }
  }

  async function save(quantity?: number) {
    if (!current || saving) return;
    const parsed = stockCountInputSchema.safeParse({ quantity: quantity ?? (draft.trim() ? Number(draft.replace(",", ".")) : undefined), expectedUpdatedAt: current.updatedAt });
    if (!parsed.success) { setError(t("count.invalid")); return; }
    setSaving(true); setError(null);
    try {
      const result = await onSave(current.id, parsed.data);
      remember(result.stockItem);
      setAnswers((answers) => ({ ...answers, [current.id]: { quantity: result.stockItem.quantity } }));
      move(index + 1);
      void Promise.resolve().then(() => onChanged?.()).catch(() => undefined);
    } catch (error) {
      await handleError(error, current, "count.failed");
    } finally { setSaving(false); }
  }

  const completed = counted + skipped + excluded;
  const percent = queue.length ? Math.round(completed / queue.length * 100) : 0;
  const roomItems = current ? queue.filter((entry) => entry.placeId === current.placeId) : [];
  const roomDone = roomItems.filter((entry) => answers[entry.id]).length;
  return <main className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background text-foreground" aria-label={t("count.title")}>
    <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheckIcon className="size-5 text-primary" />{t("count.title")}</div>
      <Button asChild variant="ghost" size="sm" disabled={saving}><Link to={returnTo} aria-disabled={saving} onClick={(event) => { if (saving) event.preventDefault(); }}><XIcon />{t("count.stop")}</Link></Button>
    </header>
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-6 sm:px-8 sm:py-10">
      {!started ? <>
        <div className="mx-auto flex size-24 items-center justify-center rounded-3xl bg-primary/15"><SparklesIcon className="size-12 text-primary" /></div>
        <div className="space-y-2 text-center"><p className="text-xs font-semibold tracking-widest text-primary uppercase">{t("count.mission")}</p><h1 className="text-3xl font-bold sm:text-4xl">{t("count.hero")}</h1><p className="text-sm text-muted-foreground">{t("count.description")}</p></div>
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <label className="flex items-center gap-2 text-sm font-medium"><MapPinIcon className="size-4" />{t("count.chooseRoom")}</label>
          <Select value={placeId} onValueChange={setPlaceId} disabled={saving}><SelectTrigger className="w-full" aria-label={t("fields.place")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("count.allPlaces")}</SelectItem>{places.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
          <p className="text-sm text-muted-foreground">{t("count.locations")}</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
            <input type="checkbox" checked={inStockOnly} disabled={saving} onChange={(event) => setInStockOnly(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" aria-describedby={`${quantityId}-filter`} />
            <span className="space-y-1"><span className="block text-sm font-medium">{t("count.inStockOnly")}</span><span id={`${quantityId}-filter`} className="block text-xs text-muted-foreground">{t("count.inStockOnlyDescription")}</span></span>
          </label>
          {!available.length && <p role="status" className="text-sm text-muted-foreground">{t("count.noProducts")}</p>}
          {excludedItems.length > 0 && <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("count.excludedProducts", { count: excludedItems.length })}</summary>
            <p className="mt-2 text-xs text-muted-foreground">{t("count.excludeDescription")}</p>
            <ul className="mt-2 divide-y">{excludedItems.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="min-w-0 text-sm break-words">{item.productName} · {item.placeName}</span><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void setExclusion(item, false)}>{t("count.includeAgain")}</Button></li>)}</ul>
          </details>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button className="h-12 w-full" disabled={saving || !available.length} onClick={start}>{t("count.start", { count: available.length })}</Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">{t("count.savedImmediately")}</p>
      </> : finished ? <>
        <div className="mx-auto flex size-28 items-center justify-center rounded-full bg-primary/15"><TrophyIcon className="size-14 text-primary" /></div>
        <div className="space-y-2 text-center"><h1 className="text-3xl font-bold">{t(skipped || excluded ? "count.finishPartial" : "count.finishAll")}</h1><p role="status" className="text-sm text-muted-foreground">{t("count.summary", { counted, changed, skipped })}</p>{excluded > 0 && <p className="text-sm text-muted-foreground">{t("count.excludedProducts", { count: excluded })}</p>}</div>
        <div className="grid grid-cols-3 gap-2 text-center">{[[counted, "count.counted"], [changed, "count.changed"], [skipped, "count.skipped"]].map(([value, label]) => <div key={label} className="rounded-2xl border bg-card p-4"><p className="text-3xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{t(String(label))}</p></div>)}</div>
        <p className="text-center text-xs text-muted-foreground">{t("count.savedImmediately")}</p>
        {skipped > 0 && <Button variant="outline" onClick={() => { setQueue(queue.filter((entry) => answers[entry.id] && "skipped" in answers[entry.id]!)); setAnswers({}); setIndex(0); setDraft(""); }}>{t("count.retrySkipped")}</Button>}
        <Button asChild className="h-12"><Link to={returnTo}><CheckIcon />{origin ? t("count.returnToRecord") : t("count.back")}</Link></Button>
      </> : current && <>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2"><p role="status" className="text-sm font-medium">{t("count.progress", { current: index + 1, total: queue.length })}</p><span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">{percent}%</span></div>
          <div role="progressbar" aria-label={t("count.title")} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none" style={{ width: `${percent}%` }} /></div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><MapPinIcon className="size-3" />{current.placeName}</span><span>{t("count.roomProgress", { current: roomDone, total: roomItems.length })}</span></div>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
          <RecordImage src={images[current.productId] ?? current.productImageUrl} shape="avatar" fit="contain" className="mx-auto size-20 rounded-2xl" fallback={<PackageIcon className="size-10 text-primary" />} />
          <div className="min-w-0 space-y-1 text-center"><h1 className="text-xl leading-tight font-bold break-words sm:text-2xl">{current.productName}</h1><p className="text-sm text-muted-foreground">{t("count.registered", { quantity: formatQuantity(current.quantity, locale), unit: current.unit ?? "" })}</p></div>
          {current.alternativeNames.length > 0 && <p className="text-center text-xs break-words text-muted-foreground">{t("count.sharedWith", { names: current.alternativeNames.join(", ") })}</p>}
          <div className="space-y-2"><label htmlFor={quantityId} className="block text-center text-sm font-medium">{t("count.actual")}</label><Input ref={input} id={quantityId} inputMode="decimal" autoComplete="off" value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }} disabled={saving} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className="h-16 text-center text-3xl! font-semibold tabular-nums" placeholder={t("count.quantityPlaceholder")} /></div>
          {error && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-12 w-full" loading={saving}><CheckIcon />{t("count.saveNext")}</Button>
          <Button type="button" variant="outline" className="h-11 w-full" disabled={saving} onClick={() => void save(current.quantity)}>{t("count.correct")}</Button>
          <div className="space-y-2 border-t pt-4">
            {shoppingAdded[current.productId] ? <p role="status" className="flex items-center justify-center gap-2 text-sm text-primary"><CheckIcon className="size-4 shrink-0" />{t(shoppingAdded[current.productId] === "added" ? "count.shoppingAdded" : "count.shoppingAlreadyListed")}</p> : shoppingFor === current.id ? <div className="space-y-2 rounded-xl border p-3">
              <label htmlFor={shoppingQuantityId} className="text-sm font-medium">{t("count.shoppingQuantity")}{current.unit && ` (${current.unit})`}</label>
              <Input id={shoppingQuantityId} inputMode="decimal" autoComplete="off" value={shoppingQuantity} disabled={saving} onChange={(event) => { setShoppingQuantity(event.target.value); setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addToShopping(); } }} />
              <div className="flex flex-wrap gap-2"><Button type="button" disabled={saving} onClick={() => void addToShopping()}><ShoppingCartIcon />{t("count.shoppingConfirm")}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => { setShoppingFor(null); setError(null); }}>{t("count.shoppingCancel")}</Button></div>
            </div> : <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal" disabled={saving} onClick={() => { setShoppingFor(current.id); setShoppingQuantity("1"); setError(null); }}><ShoppingCartIcon />{t("count.addToShopping")}</Button>}
            <Button type="button" variant="ghost" className="min-h-11 w-full whitespace-normal" disabled={saving || current.quantity <= 0} onClick={() => void setExclusion(current, !excludedFromStocktake(current))}>{t(excludedFromStocktake(current) ? "count.includeAgain" : "count.excludeUntilEmpty")}</Button>
            <p className="text-center text-xs text-muted-foreground">{t("count.excludeDescription")}</p>
          </div>
          <div className="flex justify-between gap-2"><Button type="button" variant="ghost" disabled={saving || index === 0} onClick={() => move(index - 1)}><ArrowLeftIcon />{t("count.previous")}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => { if (!answers[current.id]) setAnswers((answers) => ({ ...answers, [current.id]: { skipped: true } })); move(index + 1); }}>{t("count.skip")}</Button></div>
        </form>
        <p className="text-center text-xs text-muted-foreground">{counted > 0 ? t("count.encourage", { count: counted }) : t("count.savedImmediately")}</p>
      </>}
    </div>
  </main>;
}

/** Entry point retained for places and existing consumers; the round has its own page. */
export function StocktakeDialog({ items, defaultOpen, ...props }: Props) {
  const { t } = useTranslation("inventory");
  if (defaultOpen) return <StocktakeScreen items={items} {...props} />;
  return <Button asChild variant="outline" disabled={!items.length}><Link to="/inventory/count"><ClipboardCheckIcon />{t("count.title")}</Link></Button>;
}
