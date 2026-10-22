import * as React from "react";
import { CheckIcon, HourglassIcon, Link2Icon, LockOpenIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/layout/stack";
import { EntityPicker } from "@/components/shared/entity-picker";
import { FormField } from "@/components/shared/form-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";
import { todayIn } from "@/types/dates";
import type { TaskActionResult, TasksPageData } from "../data/tasks-loaders";
import { taskPath, type TaskLinkKind, type TaskLinks, type TaskRef } from "../types/tasks";
import { useTaskText } from "./use-task-text";
import { useFetcherResult } from "@/lib/hooks/use-fetcher-result";

type TaskLinksPanelProps = {
  taskId: string;
  links: TaskLinks;
  canManage: boolean;
  /** Route that handles the link intents; defaults to `/tasks`. */
  action?: string;
  onChanged?: () => void;
};

function LinkRow({ other, onRemove, busy }: { other: TaskRef; onRemove?: () => void; busy?: boolean }) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const done = other.status !== "open";
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border",
          done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
        aria-hidden="true"
      >
        {done && <CheckIcon className="size-3" />}
      </span>
      <Link to={taskPath(other.id)} className={cn("min-w-0 flex-1 truncate hover:underline", done && "text-muted-foreground line-through")}>
        {other.title}
      </Link>
      {!done && other.dueDate && (
        <span className="shrink-0 text-xs text-muted-foreground">{text.dueLabel({ status: other.status, dueDate: other.dueDate }, todayIn())}</span>
      )}
      {onRemove && (
        <Button variant="ghost" size="icon-sm" aria-label={t("links.remove", { title: other.title })} onClick={onRemove} disabled={busy}>
          <XIcon />
        </Button>
      )}
    </li>
  );
}

function AddLinkDialog({ taskId, open, onOpenChange, action, onChanged }: { taskId: string; open: boolean; onOpenChange: (open: boolean) => void } & Pick<TaskLinksPanelProps, "action" | "onChanged">) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const list = useFetcher<TasksPageData>();
  const save = useFetcher<TaskActionResult>();
  const [kind, setKind] = React.useState<TaskLinkKind>("blocked_by");
  const [otherTaskId, setOtherTaskId] = React.useState<string | null>(null);
  const busy = save.state !== "idle";

  React.useEffect(() => {
    if (open && list.state === "idle" && !list.data) void list.load("/tasks");
  }, [open, list]);

  useFetcherResult(save, (result) => {
    if (result.ok) {
      toast.success(t("links.added"));
      onOpenChange(false);
      onChanged?.();
    }
  });

  const items = (list.data?.overview.tasks ?? [])
    .filter((task) => task.id !== taskId && task.status === "open")
    .map((task) => ({ id: task.id, label: task.title, description: t(`types.${task.type}`) }));
  const error = save.data?.errors?.otherTaskId?.map((code) => t(`errors.${code}`, { defaultValue: code }));

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!otherTaskId) return;
            void save.submit({ intent: "link-add", id: taskId, otherTaskId, kind }, { method: "post", ...(action && { action }) });
          }}
        >
          <fieldset disabled={busy} className="min-w-0">
            <Stack gap="lg">
              <DialogHeader>
                <DialogTitle>{t("links.addTitle")}</DialogTitle>
                <DialogDescription>{t("links.addDescription")}</DialogDescription>
              </DialogHeader>
              <SegmentedControl<TaskLinkKind>
                label={t("links.kind")}
                size="sm"
                options={[
                  { value: "blocked_by", label: t("links.kinds.blocked_by") },
                  { value: "blocks", label: t("links.kinds.blocks") },
                  { value: "related", label: t("links.kinds.related") },
                ]}
                value={kind}
                onChange={setKind}
                className="self-start"
              />
              <FormField label={t("links.task")} htmlFor={`task-link-${taskId}`} errors={error}>
                {list.data ? (
                  <EntityPicker
                    id={`task-link-${taskId}`}
                    items={items}
                    value={otherTaskId}
                    onChange={setOtherTaskId}
                    placeholder={t("links.pick")}
                    invalid={Boolean(error)}
                  />
                ) : (
                  <Skeleton className="h-10 w-full" />
                )}
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {tCommon("actions.cancel")}
                </Button>
                <Button type="submit" loading={busy} disabled={!otherTaskId}>
                  {t("links.add")}
                </Button>
              </DialogFooter>
            </Stack>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What a task waits for ("Blocked by: Calculate the Fluvius invoice"), what waits for it, and related
 * tasks; adults add and remove links.
 */
export function TaskLinksPanel({ taskId, links, canManage, action = "/tasks", onChanged }: TaskLinksPanelProps) {
  const { t } = useTranslation("tasks");
  const [adding, setAdding] = React.useState(false);
  const remove = useFetcher<TaskActionResult>();
  const removing = remove.state !== "idle" ? String(remove.formData?.get("otherTaskId") ?? "") : null;
  useFetcherResult(remove, (result) => {
    if (result.ok) onChanged?.();
    else toast.error(result.formError ?? t("common:errors.generic"));
  });

  const onRemove = (other: TaskRef) =>
    canManage ? () => void remove.submit({ intent: "link-remove", id: taskId, otherTaskId: other.id }, { method: "post", action }) : undefined;
  const openBlockers = links.blockedBy.filter((other) => other.status === "open").length;
  const sections: { key: keyof TaskLinks; icon: typeof HourglassIcon; title: string; items: TaskRef[] }[] = [
    { key: "blockedBy", icon: HourglassIcon, title: t("links.blockedBy"), items: links.blockedBy },
    { key: "blocks", icon: LockOpenIcon, title: t("links.blocks"), items: links.blocks },
    { key: "related", icon: Link2Icon, title: t("links.related"), items: links.related },
  ];
  const empty = sections.every((section) => section.items.length === 0);

  return (
    <div className="flex flex-col gap-3">
      {openBlockers > 0 && <p className="text-sm font-medium text-warning">{t("waiting.summary", { count: openBlockers })}</p>}
      {empty && <p className="text-sm text-muted-foreground">{t("links.empty")}</p>}
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <div key={section.key} className="flex flex-col gap-1.5">
            <h4 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <section.icon className="size-3.5" aria-hidden="true" />
              {section.title}
            </h4>
            <ul className={cn("flex flex-col gap-1", removing && "opacity-80")}>
              {section.items.map((other) => (
                <LinkRow key={other.id} other={other} onRemove={onRemove(other)} busy={removing === other.id} />
              ))}
            </ul>
          </div>
        ))}
      {canManage && (
        <>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
            <PlusIcon />
            {t("links.add")}
          </Button>
          {/* Mounted while open, so every time starts empty. */}
          {adding && <AddLinkDialog taskId={taskId} open onOpenChange={setAdding} action={action} onChanged={onChanged} />}
        </>
      )}
    </div>
  );
}
