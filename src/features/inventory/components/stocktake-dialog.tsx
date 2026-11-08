import * as React from "react";
import { ArrowLeftIcon, CheckIcon, ClipboardCheckIcon, MapPinIcon, PackageIcon, TrophyIcon, SparklesIcon, XIcon } from "lucide-react";
import { Link, useLocation } from "react-router";
import { internalOrigin } from "@/lib/record-navigation";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api-client";
import { currentLocale } from "@/lib/i18n";
import { formatQuantity } from "@/features/shopping";
import { fetchStock, saveStockCount } from "../data/inventory-requests";
import { stockCountInputSchema, type StockItem } from "../types/inventory";

type Entry = StockItem & { originalQuantity: number };
type Answer = { quantity: number } | { skipped: true };
type Props = {
  items: StockItem[];
  onChanged?: () => void | Promise<unknown>;
  onSave?: typeof saveStockCount;
  onReload?: (item: StockItem) => Promise<StockItem[]>;
  defaultOpen?: boolean;
  images?: Record<string, string | null>;
};

/** Physical counts replace one location's quantity; blank/skip never means zero. Saves each step. */
export function StocktakeScreen({ items, images = {}, onChanged, onSave = saveStockCount, onReload = (item) => fetchStock({ productId: item.productId, placeId: item.placeId }) }: Props) {
  const { t } = useTranslation("inventory");
  const locale = currentLocale();
  const location = useLocation();
  const origin = internalOrigin(new URLSearchParams(location.search).get("from"));
  const returnTo = origin && origin !== `${location.pathname}${location.search}` ? origin : "/inventory";
  const [placeId, setPlaceId] = React.useState("all");
  const [started, setStarted] = React.useState(false);
  const [queue, setQueue] = React.useState<Entry[]>([]);
  const [index, setIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const quantityId = React.useId();
  const errorId = React.useId();
  const current = queue[index];
  const finished = started && !current;
  const places = [...new Map(items.map((item) => [item.placeId, item.placeName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const available = items.filter((item) => placeId === "all" || item.placeId === placeId);
  const counted = Object.values(answers).filter((answer) => "quantity" in answer).length;
  const skipped = Object.values(answers).filter((answer) => "skipped" in answer).length;
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
  }

  async function save(quantity?: number) {
    if (!current || saving) return;
    const parsed = stockCountInputSchema.safeParse({ quantity: quantity ?? (draft.trim() ? Number(draft.replace(",", ".")) : undefined), expectedUpdatedAt: current.updatedAt });
    if (!parsed.success) { setError(t("count.invalid")); return; }
    setSaving(true); setError(null);
    try {
      const result = await onSave(current.id, parsed.data);
      setQueue((queue) => queue.map((item) => item.id === current.id ? { ...item, ...result.stockItem } : item));
      setAnswers((answers) => ({ ...answers, [current.id]: { quantity: result.stockItem.quantity } }));
      move(index + 1);
      void Promise.resolve().then(() => onChanged?.()).catch(() => undefined);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        try {
          const latest = (await onReload(current)).find((item) => item.id === current.id);
          if (latest) setQueue((queue) => queue.map((item) => item.id === current.id ? { ...item, ...latest } : item));
        } catch { /* The next save still checks the old revision and cannot overwrite a concurrent change. */ }
        setError(t("count.conflict"));
      } else setError(t("count.failed"));
    } finally { setSaving(false); }
  }

  const completed = counted + skipped;
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
          <Select value={placeId} onValueChange={setPlaceId}><SelectTrigger className="w-full" aria-label={t("fields.place")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("count.allPlaces")}</SelectItem>{places.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
          <p className="text-sm text-muted-foreground">{t("count.locations")}</p>
          <Button className="h-12 w-full" disabled={!available.length} onClick={start}>{t("count.start", { count: available.length })}</Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">{t("count.savedImmediately")}</p>
      </> : finished ? <>
        <div className="mx-auto flex size-28 items-center justify-center rounded-full bg-primary/15"><TrophyIcon className="size-14 text-primary" /></div>
        <div className="space-y-2 text-center"><h1 className="text-3xl font-bold">{t(skipped ? "count.finishPartial" : "count.finishAll")}</h1><p role="status" className="text-sm text-muted-foreground">{t("count.summary", { counted, changed, skipped })}</p></div>
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
          <div className="mx-auto flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-muted">{images[current.productId] ? <img src={images[current.productId]!} alt="" className="size-full object-contain" /> : <PackageIcon className="size-10 text-primary" />}</div>
          <div className="min-w-0 space-y-1 text-center"><h1 className="text-xl leading-tight font-bold break-words sm:text-2xl">{current.productName}</h1><p className="text-sm text-muted-foreground">{t("count.registered", { quantity: formatQuantity(current.quantity, locale), unit: current.unit ?? "" })}</p></div>
          <div className="space-y-2"><label htmlFor={quantityId} className="block text-center text-sm font-medium">{t("count.actual")}</label><Input ref={input} id={quantityId} inputMode="decimal" autoComplete="off" value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }} disabled={saving} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className="h-16 text-center text-3xl! font-semibold tabular-nums" placeholder={t("count.quantityPlaceholder")} /></div>
          {error && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-12 w-full" loading={saving}><CheckIcon />{t("count.saveNext")}</Button>
          <Button type="button" variant="outline" className="h-11 w-full" disabled={saving} onClick={() => void save(current.quantity)}>{t("count.correct")}</Button>
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
