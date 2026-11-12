import { PageGrid } from "@/components/layout/page-grid";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordLink } from "@/components/shared/record-link";
import { structuredResponseSchema, type ResponseComponent, type StructuredResponse as Response } from "../types/response-components";

function SafeLink({ href, children, onNavigate }: { href: string; children: React.ReactNode; onNavigate?: () => void }) {
  return href.startsWith("/") ? <RecordLink to={href} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate?.(); }} className="text-primary underline underline-offset-4">{children}</RecordLink> : <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{children}</a>;
}
function DateChoice({ component, onSend, disabled }: { component: Extract<ResponseComponent, { type: "date_time" }>; onSend?: (text: string) => void; disabled?: boolean }) {
  const { t } = useTranslation("assistant");
  const [value, setValue] = React.useState("");
  return <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (value) onSend?.(`${component.prompt}: ${value}`); }}><Input type={component.includeTime ? "datetime-local" : "date"} aria-label={component.title} required value={value} onChange={(event) => setValue(event.target.value)} className="w-auto min-w-0" /><Button type="submit" disabled={disabled || !onSend}>{t("chat.send")}</Button></form>;
}
/** Trusted registry: the union is closed; model-provided HTML and JavaScript are never rendered. */
function ComponentBody({ component: c, onSend, disabled, onNavigate }: { component: ResponseComponent; onSend?: (text: string) => void; disabled?: boolean; onNavigate?: () => void }) {
  if (c.type === "summary") return <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{c.values.map((v, i) => <div key={i}><dt className="text-xs text-muted-foreground">{v.label}</dt><dd className="text-xl font-semibold tabular-nums">{v.value}</dd></div>)}</dl>;
  if (c.type === "products" || c.type === "recipes") return <PageGrid gap="3" className="sm:grid-cols-2">{c.items.map((item, i) => <article key={i} className="min-w-0 rounded-lg border bg-background p-3">{item.image && <img src={item.image} alt="" loading="lazy" className="mb-2 h-28 w-full rounded-md object-contain" />}<Text weight="medium">{item.name}</Text>{item.price && <Text weight="semibold" className="tabular-nums">{item.price}</Text>}{item.shop && <Text size="xs" tone="muted">{item.shop}</Text>}{item.detail && <Text size="sm" tone="muted">{item.detail}</Text>}{item.href && <SafeLink href={item.href} onNavigate={onNavigate}>{item.name}</SafeLink>}</article>)}</PageGrid>;
  if (c.type === "table") return <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{c.columns.map((column, i) => <th key={i} className="border-b px-3 py-2 font-medium">{column}</th>)}</tr></thead><tbody>{c.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border-b px-3 py-2 align-top">{cell}</td>)}</tr>)}</tbody></table></div>;
  if (c.type === "chart") {
    const max = Math.max(1, ...c.points.map((point) => Math.abs(point.value)));
    if (c.style === "line" && c.points.length > 1) {
      const points = c.points.map((point, index) => ({ x: 10 + index / (c.points.length - 1) * 280, y: 100 - point.value / max * 80, ...point }));
      return <div><svg viewBox="0 0 300 120" className="h-36 w-full" role="img" aria-label={c.title}><polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="2" />{points.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r="3" fill="var(--primary)"><title>{point.label}: {point.display}</title></circle>)}</svg><ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{c.points.map((point, i) => <li key={i}>{point.label}: {point.display}</li>)}</ul></div>;
    }
    return <ul className="flex flex-col gap-3">{c.points.map((point, i) => <li key={i}><Inline gap="sm" align="stretch" justify="between" className="text-sm"><span>{point.label}</span><span className="tabular-nums">{point.display}</span></Inline><div className="mt-1 h-2 rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${Math.abs(point.value) / max * 100}%` }} /></div></li>)}</ul>;
  }
  if (c.type === "shopping" || c.type === "tasks" || c.type === "inventory" || c.type === "calendar") {
    const groups = new Map<string, typeof c.items>();
    for (const item of c.items) { const key = item.group ?? ""; groups.set(key, [...(groups.get(key) ?? []), item]); }
    return <Stack gap="3">{[...groups].map(([group, items]) => <div key={group}>{group && <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{group}</h4>}<ul className="divide-y">{items.map((item, i) => <li key={`${item.id}-${i}`} className="flex min-w-0 items-start justify-between gap-2 py-2 text-sm"><div className="min-w-0">{item.href ? <SafeLink href={item.href} onNavigate={onNavigate}>{item.label}</SafeLink> : <span>{item.label}</span>}{item.detail && <Text size="xs" tone="muted">{item.detail}</Text>}{item.actions && <Inline gap="sm" align="stretch" wrap className="mt-2">{item.actions.map((action, j) => <Button key={j} size="sm" variant="outline" disabled={disabled || !onSend} onClick={() => onSend?.(action.message)}>{action.label}</Button>)}</Inline>}</div>{item.status && <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">{item.status}</span>}</li>)}</ul></div>)}</Stack>;
  }
  if (c.type === "choices") return <Inline gap="sm" align="stretch" wrap>{c.choices.map((choice, i) => <Button key={i} variant="outline" className="h-auto min-h-10 whitespace-normal" disabled={disabled || !onSend} onClick={() => onSend?.(choice.message)}>{choice.label}</Button>)}</Inline>;
  if (c.type === "date_time") return <DateChoice component={c} onSend={onSend} disabled={disabled} />;
  if (c.type === "progress") return <div><progress className="w-full accent-primary" value={c.completed} max={c.total} aria-label={c.title} /><Text size="xs" tone="muted">{c.completed}/{c.total} {c.detail}</Text></div>;
  if (c.type === "links") return <ul className="flex flex-col gap-2 text-sm">{c.links.map((link, i) => <li key={i}><SafeLink href={link.href} onNavigate={onNavigate}>{link.label}</SafeLink></li>)}</ul>;
  if (c.type === "error") return <div role="alert"><Text size="sm" tone="danger">{c.detail}</Text>{c.recovery.map((link, i) => <Text key={i}><SafeLink href={link.href} onNavigate={onNavigate}>{link.label}</SafeLink></Text>)}</div>;
  return null;
}
export function StructuredResponse({ response, onSend, disabled, onNavigate }: { response: Response; onSend?: (text: string) => void; disabled?: boolean; onNavigate?: () => void }) {
  const parsed = structuredResponseSchema.safeParse(response);
  if (!parsed.success) return null;
  return <Stack gap="3" className="min-w-0">{parsed.data.components.map((component, i) => <section key={i} className="min-w-0 overflow-hidden rounded-xl border bg-card p-4"><h3 className="mb-3 font-semibold">{component.title}</h3><ComponentBody component={component} onSend={onSend} disabled={disabled} onNavigate={onNavigate} /></section>)}</Stack>;
}
