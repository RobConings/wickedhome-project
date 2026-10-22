import * as React from "react";
import { BanIcon, CalendarIcon, CircleCheckIcon, LinkIcon, ListChecksIcon, MoreVerticalIcon, PackageIcon, PencilIcon, PlayIcon, ReceiptIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { Stack } from "@/components/layout/stack";
import { Card, CardTitle } from "@/components/shared/card";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { documentContentUrl } from "@/features/documents";
import { LinkToProjectDialog } from "../components/link-to-project-dialog";
import { ProjectBudgetBadge, ProjectStatusBadge } from "../components/project-badges";
import { ProjectBudgetCard } from "../components/project-budget-card";
import { ProjectCoverChooser } from "../components/project-cover-chooser";
import { ProjectExpensesSection, type RenderLogExpense } from "../components/project-expenses-section";
import { ProjectFormDialog } from "../components/project-form-dialog";
import { ProjectAvatar } from "../components/project-icon";
import { ProjectPurchasesNote } from "../components/project-purchases-note";
import { useProjectText } from "../components/use-project-text";
import type { ProjectActionResult } from "../data/projects-loaders";
import type { ProjectDetail, ProjectStatus } from "../types/projects";
import { BackButton } from "@/components/shared/link-buttons";
import { ColorDot } from "@/components/shared/color-dot";

type PlaceOption = { id: string; name: string; color: string; icon: string | null };

type ProjectDetailScreenProps = {
  detail: ProjectDetail;
  /** For the edit form. */
  places: PlaceOption[];
  canManage: boolean;
  /** The project's tasks (tasks feature), composed by the route. */
  tasks?: React.ReactNode;
  /** The project's materials (shopping feature), composed by the route. */
  materials?: React.ReactNode;
  /** Attachments: quotes, receipts, photos (documents feature), composed by the route. */
  attachments?: React.ReactNode;
  /** Who works on the project: contractor, architect… (contacts feature), composed by the route. */
  contacts?: React.ReactNode;
  /** The person's own mails about the project (integrations feature, Gmail), composed by the route; renders nothing without Gmail. */
  mail?: React.ReactNode;
  /** "Log an expense" prefilled with the project (expenses feature), composed by the route. */
  renderLogExpense?: RenderLogExpense;
};

/** What a status action leads to. */
const NEXT_STATUSES: Record<ProjectStatus, ProjectStatus[]> = {
  planned: ["active", "done", "cancelled"],
  active: ["done", "cancelled", "planned"],
  done: ["active"],
  cancelled: ["active", "planned"],
};
const STATUS_ICONS: Record<ProjectStatus, typeof PlayIcon> = {
  active: PlayIcon,
  done: CircleCheckIcon,
  cancelled: BanIcon,
  planned: RotateCcwIcon,
};

/**
 * One project: budget (spent, committed, remaining), its tasks with what they wait for, the materials to buy,
 * its expenses, places, dates, contacts and attachments. Edit, start, finish or cancel it.
 */
export function ProjectDetailScreen({ detail, places, canManage, tasks, materials, attachments, contacts, mail, renderLogExpense }: ProjectDetailScreenProps) {
  const { t } = useTranslation("projects");
  const { t: tCommon } = useTranslation();
  const text = useProjectText();
  const { project } = detail;
  const fetcher = useFetcher<ProjectActionResult>();
  const [editing, setEditing] = React.useState(false);
  const period = text.period(project);
  const pendingStatus = fetcher.formData?.get("intent") === "status" ? (String(fetcher.formData.get("status")) as ProjectStatus) : null;
  const status = pendingStatus ?? project.status;

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.formError) toast.error(fetcher.data.formError);
    else if (fetcher.data.ok && fetcher.data.intent === "status") toast.success(t("status.changed"));
  }, [fetcher.state, fetcher.data, t]);

  const setStatus = (next: ProjectStatus) => void fetcher.submit({ intent: "status", id: project.id, status: next }, { method: "post" });

  const actions = canManage && (
    <>
      {status === "planned" && (
        <Button onClick={() => setStatus("active")} loading={pendingStatus === "active"}>
          <PlayIcon />
          {t("statusActions.active")}
        </Button>
      )}
      {status === "active" && (
        <Button variant="outline" onClick={() => setStatus("done")} loading={pendingStatus === "done"}>
          <CircleCheckIcon />
          {t("statusActions.done")}
        </Button>
      )}
      <Button variant="outline" onClick={() => setEditing(true)}>
        <PencilIcon />
        {tCommon("actions.edit")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={t("actions.more")} title={t("actions.more")}>
            <MoreVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {NEXT_STATUSES[status].map((next) => {
            const Icon = STATUS_ICONS[next];
            return (
              <DropdownMenuItem key={next} onSelect={() => setStatus(next)}>
                <Icon />
                {t(`statusActions.${next === "active" && (status === "done" || status === "cancelled") ? "reopen" : next}`)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteConfirmDialog
        trigger={
          <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" aria-label={tCommon("actions.delete")} title={tCommon("actions.delete")}>
            <Trash2Icon />
          </Button>
        }
        title={t("delete.title", { name: project.name })}
        description={t("delete.description")}
        onConfirm={() => fetcher.submit({ intent: "delete", id: project.id }, { method: "post" })}
      />
    </>
  );

  return (
    <PageContainer>
      <Stack gap="md">
        <BackButton to="/projects">{t("actions.back")}</BackButton>
        {project.coverFileId && (
          <img src={documentContentUrl(project.coverFileId)} alt="" className="h-36 w-full rounded-xl object-cover sm:h-48" />
        )}
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <ProjectAvatar project={project} size="lg" />
              <span className="min-w-0 break-words">{project.name}</span>
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-2 pt-1">
              <ProjectStatusBadge status={status} />
              <ProjectBudgetBadge budget={project.budget} />
              {project.tag && <span className="text-sm text-muted-foreground">{project.tag}</span>}
              {period && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarIcon className="size-3.5" aria-hidden="true" />
                  {period}
                </span>
              )}
            </span>
          }
          actions={actions}
        />
      </Stack>
      {canManage && editing && (
        <ProjectFormDialog project={project} places={places} open={editing} onOpenChange={setEditing} />
      )}

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg">
          <ProjectBudgetCard budget={project.budget} className="lg:hidden" />

          <PageSection aria-labelledby="project-tasks">
            <SectionHeader
              id="project-tasks"
              title={
                <span className="flex items-center gap-2">
                  <ListChecksIcon className="size-5 text-primary" aria-hidden="true" />
                  {t("tasks.title")}
                </span>
              }
              description={
                project.tasks.total > 0 ? t("tasks.progress", { done: project.tasks.done, total: project.tasks.total }) : t("tasks.description")
              }
            />
            {tasks}
            {canManage && (
              <LinkToProjectDialog
                projectId={project.id}
                kind="task"
                trigger={
                  <Button variant="ghost" size="sm" className="self-start">
                    <LinkIcon />
                    {t("tasks.linkExisting")}
                  </Button>
                }
              />
            )}
          </PageSection>

          <PageSection aria-labelledby="project-materials">
            <SectionHeader
              id="project-materials"
              title={
                <span className="flex items-center gap-2">
                  <PackageIcon className="size-5 text-primary" aria-hidden="true" />
                  {t("materials.title")}
                </span>
              }
              description={t("materials.description")}
            />
            {materials}
            {canManage && (
              <ProjectPurchasesNote projectId={project.id} projectName={project.name} materials={detail.materials} renderLogExpense={renderLogExpense} />
            )}
          </PageSection>

          <PageSection aria-labelledby="project-expenses">
            <SectionHeader
              id="project-expenses"
              title={
                <span className="flex items-center gap-2">
                  <ReceiptIcon className="size-5 text-primary" aria-hidden="true" />
                  {t("expenses.title")}
                </span>
              }
              description={t("expenses.description")}
            />
            <ProjectExpensesSection
              projectId={project.id}
              today={detail.today}
              expenses={detail.expenses}
              recurring={detail.recurring}
              canManage={canManage}
              renderLogExpense={renderLogExpense}
              materials={detail.materials}
              invoiceReader={detail.invoiceReader}
            />
          </PageSection>
        </Stack>

        <Stack gap="lg">
          <ProjectBudgetCard budget={project.budget} className="hidden lg:flex" />
          <Card>
            <CardTitle>{t("detail.details")}</CardTitle>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{t("fields.places")}</dt>
                <dd>
                  {project.places.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5 pt-1">
                      {project.places.map((place) => (
                        <Link
                          key={place.id}
                          to={`/places/${encodeURIComponent(place.id)}`}
                          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent"
                        >
                          {place.icon ? (
                            <span aria-hidden="true">{place.icon}</span>
                          ) : (
                            <ColorDot color={place.color} className="size-2 rounded-full" />
                          )}
                          {place.name}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("detail.noPlaces")}</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{t("detail.dates")}</dt>
                <dd className={period ? undefined : "text-muted-foreground"}>{period ?? t("detail.noDates")}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{t("fields.description")}</dt>
                <dd className={project.description ? "whitespace-pre-line" : "text-muted-foreground"}>
                  {project.description ?? t("detail.noDescription")}
                </dd>
              </div>
            </dl>
          </Card>
          {contacts}
          {mail}
          <Card>
            <CardTitle>{t("cover.title")}</CardTitle>
            <ProjectCoverChooser projectId={project.id} coverFileId={project.coverFileId} canManage={canManage} />
          </Card>
          {attachments}
        </Stack>
      </PageGrid>
    </PageContainer>
  );
}
