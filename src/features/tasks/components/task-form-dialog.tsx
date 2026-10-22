import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField, GeneralFormValues } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { SegmentedControl } from "./segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Habitant } from "@/features/household";
import { PlacePicker, usePlaceSelections, type Place } from "@/features/places";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { TaskActionResult } from "../data/tasks-loaders";
import { EMPTY_WHEN, TASK_WHEN_NAMES, isTimedWhen, reminderChoices, switchWhenKind, whenValueOf, type TaskWhenValue } from "../types/task-when";
import {
  DEFAULT_TASK_TYPE,
  ESTIMATE_PRESETS,
  TASK_ERROR_CODES,
  TASK_PRIORITIES,
  TASK_TYPES,
  type Task,
  type TaskPriority,
  type TaskType,
} from "../types/tasks";
import { AssigneePicker } from "./assignee-picker";
import { ChecklistEditor } from "./checklist-editor";
import { TaskOriginBadge } from "./task-flags";
import { TaskRepeatField } from "./task-repeat-field";
import { TASK_TYPE_ICONS } from "./task-type-icons";
import { TaskWhenField } from "./task-when-field";
import { useTaskText } from "./use-task-text";

/** Pre-filled values for a new task. The type defaults to a household chore. */
export type TaskFormDefaults = {
  type?: TaskType;
  placeId?: string | null;
  assigneeIds?: string[];
  dueDate?: string | null;
  /** `HH:MM`, e.g. when added from an hour in the calendar. */
  dueTime?: string | null;
  /** The project a new task belongs to (e.g. added from a project's page). */
  projectId?: string | null;
};

/**
 * A "Project" field for the form, composed by the route (e.g. the projects feature's `ProjectFormField`); it must
 * post `projectId`. Tasks don't know projects: without the slot, the project stays as it is.
 */
export type TaskProjectField = (props: { defaultValue: string | null }) => React.ReactNode;

type TaskFormDialogProps = {
  /** Edit this task; omit to create one. */
  task?: Task;
  habitants: Habitant[];
  places: Place[];
  /** Today in the household time zone: the start of a repeat rule without a due date. */
  today: string;
  /** Pre-filled values for a new task, e.g. the place it is added from. */
  defaults?: TaskFormDefaults;
  trigger?: React.ReactElement;
  /** Controlled open state (e.g. opened from a URL). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Seed place favourites/recents (stories). */
  placeSelections?: UseSelectionsOptions["initial"];
  /** Open with "Repeats" switched on ("Repeat this" from a task's menu). */
  startRepeating?: boolean;
  /** Optional "Project" field (see `TaskProjectField`). */
  projectField?: TaskProjectField;
};

const NO_ESTIMATE = "none";
const NO_REMINDER = "none";

const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** The "When" control's value from the form values. */
const whenOf = (values: GeneralFormValues): TaskWhenValue => (values.when as TaskWhenValue | undefined) ?? EMPTY_WHEN;

/**
 * Add or edit a task: what, where, who, when, how often, and optional steps. A `GeneralFormDialog`; the
 * "When" (none / day / time / timeslot / several days, `TaskWhenField`), reminder, repeat rule, checklist,
 * assignees, priority and project are custom fields. Posts `create` / `update` to `/tasks`.
 */
export function TaskFormDialog({
  task,
  habitants,
  places,
  today,
  defaults = {},
  trigger,
  open,
  onOpenChange,
  placeSelections,
  startRepeating = false,
  projectField,
}: TaskFormDialogProps) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const { recordUse } = usePlaceSelections(placeSelections ? { initial: placeSelections } : undefined);

  const isEdit = Boolean(task);
  // A linked task follows its origin (waste collection, an expense): only who and notes are editable.
  const linked = Boolean(task?.origin);
  // Kept here too for the due date's "(optional)": a repeating task needs a first date.
  const [rrule, setRrule] = React.useState(task?.rrule ?? "");

  /** Our own validation codes are translated; zod's messages already are. */
  const translateError = (message: string) =>
    (TASK_ERROR_CODES as readonly string[]).includes(message) ? t(`errors.${message}`) : message;

  /**
   * Switching "Repeats" on without a date makes the task due today (a repeating task needs a first date). A
   * reminder that doesn't fit the new "when" (a timed choice on an all-day task, or no date at all) is reset.
   */
  const adjustValues = (next: GeneralFormValues, _previous: GeneralFormValues, changed: string): GeneralFormValues => {
    const when = whenOf(next);
    if (changed === "rrule" && next.rrule && when.kind === "none") return { ...next, when: switchWhenKind(when, "day", today) };
    if (changed === "when" && next.reminderMinutes !== NO_REMINDER) {
      const fits = when.kind !== "none" && reminderChoices(when.kind, currentReminderFor(when.kind)).includes(Number(next.reminderMinutes));
      if (!fits) return { ...next, reminderMinutes: NO_REMINDER };
    }
    return next;
  };

  const initialWhen = task
    ? whenValueOf(task)
    : whenValueOf({ dueDate: defaults.dueDate ?? (defaults.dueTime ? today : null), dueTime: defaults.dueTime });
  /** The task's own reminder stays a choice while it still counts back from the same kind of start. */
  const currentReminderFor = (kind: TaskWhenValue["kind"]) =>
    task && isTimedWhen(kind) === isTimedWhen(initialWhen.kind) ? task.reminderMinutes : null;

  const estimates = [...new Set([...ESTIMATE_PRESETS, ...(task?.estimatedMinutes ? [task.estimatedMinutes] : [])])].sort((a, b) => a - b);

  const fields: GeneralFormField[] = [
    { name: "title", type: "text", label: t("fields.title"), placeholder: t("placeholders.title"), maxLength: 120, hidden: linked },
    {
      name: "type",
      type: "select",
      label: t("fields.type"),
      hidden: linked,
      options: TASK_TYPES.map((value) => {
        const Icon = TASK_TYPE_ICONS[value];
        return {
          value,
          icon: <Icon aria-hidden="true" />,
          label: (
            <>
              {t(`types.${value}`)}
              <span className="text-muted-foreground">· {t(`typeExamples.${value}`)}</span>
            </>
          ),
        };
      }),
    },
    {
      name: "placeId",
      type: "custom",
      label: t("fields.place"),
      description: t("hints.place"),
      optional: true,
      hidden: linked,
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <PlacePicker
          id={id}
          name={name}
          places={places}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          initialSelections={placeSelections}
          clearable
        />
      ),
    },
    {
      name: "when",
      type: "custom",
      label: t("when.label"),
      bare: true,
      hidden: linked,
      errorNames: TASK_WHEN_NAMES,
      render: ({ id, value, setValue, errorsFor, disabled }) => (
        <TaskWhenField
          id={id}
          value={(value as TaskWhenValue | undefined) ?? EMPTY_WHEN}
          onChange={setValue}
          today={today}
          errorsFor={errorsFor}
          disabled={disabled}
          label={
            <>
              {t("when.label")}
              {!rrule && <span className="font-normal text-muted-foreground"> {t("when.optional")}</span>}
            </>
          }
        />
      ),
    },
    {
      name: "rrule",
      type: "custom",
      label: t("repeat.label"),
      bare: true,
      hidden: linked,
      render: ({ id, name, values, setValue, errors }) => (
        <TaskRepeatField
          name={name}
          id={id}
          defaultValue={task?.rrule}
          startDate={whenOf(values).date || today}
          defaultOn={startRepeating}
          onChange={(next) => {
            setValue(next);
            setRrule(next);
          }}
          errors={errors}
        />
      ),
    },
    {
      name: "reminderMinutes",
      type: "custom",
      label: t("fields.reminder"),
      description: t("hints.reminder"),
      optional: true,
      span: "half",
      hidden: linked,
      // A reminder needs a date: timed tasks count back from their (start) time, all-day ones from 09:00.
      when: (values) => whenOf(values).kind !== "none",
      render: ({ id, name, value, values, setValue, invalid, describedBy, disabled }) => {
        const kind = whenOf(values).kind;
        const choices = reminderChoices(kind, currentReminderFor(kind));
        return (
          <Select name={name} value={typeof value === "string" ? value : NO_REMINDER} onValueChange={setValue} disabled={disabled}>
            <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_REMINDER}>{t("reminder.none")}</SelectItem>
              {choices.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {text.reminderOffset(minutes, !isTimedWhen(kind))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      name: "estimatedMinutes",
      type: "select",
      label: t("fields.estimate"),
      optional: true,
      span: "half",
      hidden: linked,
      options: [
        { value: NO_ESTIMATE, label: t("estimate.none") },
        ...estimates.map((minutes) => ({ value: String(minutes), label: text.duration(minutes) })),
      ],
    },
    {
      name: "priority",
      type: "custom",
      label: t("fields.priority"),
      bare: true,
      hidden: linked,
      render: ({ name, value, setValue }) => (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("fields.priority")}</span>
          <SegmentedControl<TaskPriority>
            name={name}
            label={t("fields.priority")}
            size="sm"
            options={TASK_PRIORITIES.map((priority) => ({ value: priority, label: t(`priority.${priority}`) }))}
            value={(value as TaskPriority | undefined) ?? "normal"}
            onChange={setValue}
            className="self-start"
          />
        </div>
      ),
    },
    {
      name: "assigneeIds",
      type: "custom",
      label: t("fields.assignees"),
      optional: true,
      render: ({ id, name, value, setValue }) => (
        <AssigneePicker id={id} name={name} label={t("fields.assignees")} habitants={habitants} defaultValue={idsOf(value)} onChange={setValue} />
      ),
    },
    {
      name: "rotateAssignees",
      type: "switch",
      label: t("fields.rotate"),
      description: t("hints.rotate"),
      // Taking turns only means something for a repeating task with several people.
      when: (values) => Boolean(values.rrule) && idsOf(values.assigneeIds).length > 1,
    },
    {
      name: "checklist",
      type: "custom",
      label: t("fields.checklist"),
      optional: true,
      hidden: linked,
      render: ({ id, name }) => <ChecklistEditor id={id} name={name} defaultValue={task?.checklist} />,
    },
    {
      name: "projectId",
      type: "custom",
      label: "",
      bare: true,
      hidden: !projectField,
      render: () => projectField?.({ defaultValue: task ? (task.project?.id ?? null) : (defaults.projectId ?? null) }),
    },
    { name: "notes", type: "textarea", label: t("fields.notes"), optional: true, rows: 3, maxLength: 2000, placeholder: t("placeholders.notes") },
  ];

  return (
    <GeneralFormDialog<TaskActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        // Every opening starts fresh, also this copy of the rule.
        if (next) setRrule(task?.rrule ?? "");
        onOpenChange?.(next);
      }}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={t("form.description")}
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      action="/tasks"
      intent={isEdit ? "update" : "create"}
      fields={fields}
      adjustValues={adjustValues}
      translateError={translateError}
      hiddenFields={{
        id: task?.id,
        // A linked task keeps what its origin decides.
        ...(linked && task ? { title: task.title, type: task.type, priority: task.priority, dueDate: task.dueDate } : {}),
        // A new task from a project's page belongs to it, also without a project field.
        projectId: !task && !projectField ? defaults.projectId : undefined,
      }}
      intro={
        linked && task ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <TaskOriginBadge task={task} full />
              <span className="font-medium">{task.title}</span>
            </div>
            <p className="text-muted-foreground">{t("linked.formHint")}</p>
          </div>
        ) : undefined
      }
      defaultValues={{
        title: task?.title ?? "",
        type: task?.type ?? defaults.type ?? DEFAULT_TASK_TYPE,
        placeId: task?.place?.id ?? defaults.placeId ?? null,
        when: initialWhen,
        estimatedMinutes: task?.estimatedMinutes ? String(task.estimatedMinutes) : NO_ESTIMATE,
        reminderMinutes: task?.reminderMinutes != null ? String(task.reminderMinutes) : NO_REMINDER,
        rrule: task?.rrule ?? "",
        priority: task?.priority ?? "normal",
        assigneeIds: task?.assigneeIds ?? defaults.assigneeIds ?? [],
        rotateAssignees: task?.rotateAssignees ?? false,
        notes: task?.notes ?? "",
      }}
      onSuccess={(result) => {
        const placeId = result.task?.place?.id;
        if (placeId) void recordUse(placeId);
      }}
    />
  );
}
