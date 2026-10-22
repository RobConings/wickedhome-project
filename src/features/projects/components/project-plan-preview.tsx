import * as React from "react";
import { AlertTriangleIcon, CalendarIcon, CircleCheckIcon, ClockIcon, CornerDownRightIcon, ExternalLinkIcon, ListChecksIcon, MapPinIcon, TrendingUpIcon, UserIcon, UsersIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InlineAlert } from "./inline-alert";
import { SegmentedControl } from "./segmented-control";
import { Badge } from "@/components/ui/badge";
import type { AssistantPreviewRendererProps } from "@/features/assistant";
import { intlLocale } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { groupPlanMaterials, planMaterialCents, planTotals, projectPlanDataSchema, type PlanMaterialGrouping, type ProjectPlanData } from "../types/project-plan";
import { useProjectText } from "./use-project-text";

/**
 * The assistant's project plan (`kind: "project-plan"`) on a confirmation card: the project (name, budget,
 * dates, rooms, contractor), its tasks in order with people, room, date and what each waits for, the materials
 * grouped by task or by shop with quantity and price, and the material estimate against the budget. One
 * column for phones; token colours, so dark mode follows. Registered lazily in src/app/assistant-previews.ts.
 * The data comes from the server (ai/skills/planner): validated here.
 */
export default function ProjectPlanPreview({ preview }: AssistantPreviewRendererProps) {
  const { t } = useTranslation("projects");
  const parsed = projectPlanDataSchema.safeParse(preview.data);
  if (!parsed.success) return <p className="text-sm text-muted-foreground">{t("plan.invalid")}</p>;
  return <PlanBody data={parsed.data} />;
}

const COLLAPSED = 12;

function PlanBody({ data }: { data: ProjectPlanData }) {
  const { t } = useTranslation("projects");
  return (
    <div className="flex min-w-0 flex-col gap-4 text-sm">
      <PlanHeader data={data} />
      <PlanTotals data={data} />
      {data.warnings.length > 0 && (
        <InlineAlert tone="warning">
          <p className="font-medium">{t("plan.warnings")}</p>
          <ul className="mt-1 list-disc pl-4">
            {data.warnings.map((warning, index) => (
              <li key={index} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}
      {data.tasks.length > 0 && <PlanTasks data={data} />}
      {data.materials.length > 0 && <PlanMaterials data={data} />}
    </div>
  );
}

function Meta({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

function PlanHeader({ data }: { data: ProjectPlanData }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const { project } = data;
  const period = text.period({ startDate: project.start, endDate: project.end });
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-base font-semibold break-words">{project.name}</h3>
        <Badge variant={project.existing ? "neutral" : "info"}>{project.existing ? t("plan.existingProject") : t("plan.newProject")}</Badge>
      </div>
      <div className="flex flex-col gap-1 text-muted-foreground">
        <Meta icon={WalletIcon}>{project.budgetCents === null ? t("plan.noBudget") : t("plan.budget", { amount: text.money(project.budgetCents) })}</Meta>
        {period && <Meta icon={CalendarIcon}>{period}</Meta>}
        {project.places.length > 0 && <Meta icon={MapPinIcon}>{project.places.join(", ")}</Meta>}
        {project.contact && <Meta icon={UserIcon}>{t("plan.contact", { name: project.contact })}</Meta>}
      </div>
      {project.notes && <p className="whitespace-pre-line break-words text-muted-foreground">{project.notes}</p>}
    </div>
  );
}

function PlanTotals({ data }: { data: ProjectPlanData }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const totals = planTotals(data);
  const row = (label: string, cents: number, strong = false) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn(strong ? "font-medium" : "text-muted-foreground")}>{label}</span>
      <span className={cn("shrink-0 tabular-nums", strong && "font-semibold")}>{text.money(cents)}</span>
    </div>
  );
  const StatusIcon = totals.status === "over_budget" ? TrendingUpIcon : totals.status === "at_risk" ? AlertTriangleIcon : CircleCheckIcon;
  return (
    <section aria-label={t("plan.totals")} className="flex flex-col gap-1.5 rounded-md border bg-background p-2.5">
      {row(t("plan.materialsEstimate"), totals.materialsCents)}
      {data.project.usedCents > 0 && row(t("plan.alreadyUsed"), data.project.usedCents)}
      {data.project.usedCents > 0 && row(t("plan.total"), totals.totalCents, true)}
      {totals.budgetCents !== null && totals.remainingCents !== null && (
        <div className={cn("flex items-center gap-1.5 border-t pt-1.5", totals.status === "over_budget" ? "text-destructive" : totals.status === "at_risk" ? "text-warning-foreground" : "text-success-foreground")}>
          <StatusIcon aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 font-medium break-words">
            {totals.remainingCents < 0
              ? t("plan.over", { amount: text.money(-totals.remainingCents), budget: text.money(totals.budgetCents) })
              : t("plan.left", { amount: text.money(totals.remainingCents), budget: text.money(totals.budgetCents) })}
          </span>
        </div>
      )}
      {totals.unpriced > 0 && <p className="text-xs text-muted-foreground">{t("plan.unpriced", { count: totals.unpriced })}</p>}
      <p className="text-xs text-muted-foreground">{t("plan.estimateNote")}</p>
    </section>
  );
}

function ShowAll({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation("projects");
  if (total <= COLLAPSED) return null;
  return (
    <button type="button" onClick={onToggle} className="self-start rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      {expanded ? t("plan.showLess") : t("plan.showAll", { count: total })}
    </button>
  );
}

function PlanTasks({ data }: { data: ProjectPlanData }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? data.tasks : data.tasks.slice(0, COLLAPSED);
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-medium">{t("plan.tasks", { count: data.tasks.length })}</h4>
      <ol className="flex flex-col gap-2">
        {shown.map((task, index) => {
          const details = [
            task.who.length > 0 && { icon: UsersIcon, label: task.who.join(", ") },
            task.place && { icon: MapPinIcon, label: task.place },
            task.due && { icon: CalendarIcon, label: text.date(task.due) },
            task.hours !== null && { icon: ClockIcon, label: t("plan.hours", { count: task.hours }) },
            task.checklist > 0 && { icon: ListChecksIcon, label: t("plan.checklist", { count: task.checklist }) },
          ].filter((detail): detail is { icon: typeof UsersIcon; label: string } => Boolean(detail));
          return (
            <li key={index} className="flex min-w-0 gap-2.5">
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium break-words">
                  <span className="sr-only">{index + 1}. </span>
                  {task.title}
                </span>
                {details.length > 0 && (
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {details.map((detail, detailIndex) => (
                      <Meta key={detailIndex} icon={detail.icon}>
                        {detail.label}
                      </Meta>
                    ))}
                  </span>
                )}
                {task.waitsFor.length > 0 && (
                  <span className="flex items-start gap-1 text-xs text-info-foreground">
                    <CornerDownRightIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 break-words">
                      {t("plan.waitsFor", {
                        count: task.waitsFor.length,
                        tasks: task.waitsFor.map((n) => `${n}. ${data.tasks[n - 1]?.title ?? ""}`).join(", "),
                      })}
                    </span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <ShowAll total={data.tasks.length} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
    </section>
  );
}

const isWebLink = (url: string) => /^https?:\/\//i.test(url);

function PlanMaterials({ data }: { data: ProjectPlanData }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const [by, setBy] = React.useState<PlanMaterialGrouping>("task");
  const number = new Intl.NumberFormat(intlLocale(currentLocale()), { maximumFractionDigits: 3 });
  const [expanded, setExpanded] = React.useState(false);
  const groups = groupPlanMaterials(data, by, { wholeProject: t("plan.wholeProject"), noShop: t("plan.noShop") });
  // Collapsed: the first rows across the groups.
  const limit = expanded ? Number.POSITIVE_INFINITY : COLLAPSED;
  const visible = groups
    .map((group, index) => {
      const before = groups.slice(0, index).reduce((sum, other) => sum + other.materials.length, 0);
      return { ...group, materials: group.materials.slice(0, Math.max(0, limit - before)) };
    })
    .filter((group) => group.materials.length > 0);
  const hasShops = data.materials.some((material) => material.shop);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">{t("plan.materials", { count: data.materials.length })}</h4>
        {hasShops && (
          <SegmentedControl
            size="sm"
            label={t("plan.groupBy")}
            value={by}
            onChange={setBy}
            options={[
              { value: "task", label: t("plan.byTask") },
              { value: "shop", label: t("plan.byShop") },
            ]}
          />
        )}
      </div>
      <div className="flex flex-col gap-3">
        {visible.map((group) => (
          <div key={group.key} className="flex flex-col gap-1">
            <p className="text-xs font-medium break-words text-muted-foreground">{group.label}</p>
            <ul className="flex flex-col divide-y rounded-md border bg-background">
              {group.materials.map((material, index) => {
                const line = planMaterialCents(material);
                const quantity = `${number.format(material.quantity)}${material.unit ? ` ${material.unit}` : material.quantity !== 1 ? "×" : ""}`;
                const extra = by === "task" ? material.shop : material.task !== null ? `${material.task}. ${data.tasks[material.task - 1]?.title ?? ""}` : null;
                return (
                  <li key={index} className="flex min-w-0 items-start justify-between gap-3 px-2.5 py-1.5">
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-start gap-1.5">
                        <span className="min-w-0 break-words">{material.name}</span>
                        {material.url && isWebLink(material.url) && (
                          <a
                            href={material.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("plan.link", { name: material.name })}
                            className="mt-0.5 shrink-0 rounded-sm text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <ExternalLinkIcon aria-hidden className="size-3.5" />
                          </a>
                        )}
                      </span>
                      <span className="text-xs break-words text-muted-foreground">{[quantity, extra].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {line === null ? (
                        <span className="text-xs text-muted-foreground">{t("plan.noPrice")}</span>
                      ) : material.url ? (
                        text.money(line)
                      ) : (
                        <span title={t("plan.estimate")}>≈ {text.money(line)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <ShowAll total={data.materials.length} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
    </section>
  );
}
