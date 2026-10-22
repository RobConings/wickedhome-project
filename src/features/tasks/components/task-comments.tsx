import * as React from "react";
import { PencilIcon, SendIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "./confirm-dialog";
import { HabitantAvatar, type Habitant } from "@/features/household";
import type { TaskActionResult } from "../data/tasks-loaders";
import type { TaskComment } from "../types/tasks";
import { useTaskText } from "./use-task-text";

type TaskCommentsProps = {
  taskId: string;
  comments: TaskComment[];
  habitants: Habitant[];
  /** Route that handles the comment intents; defaults to `/tasks`. */
  action?: string;
  /** After a change, e.g. to reload a panel that fetches its own data. */
  onChanged?: () => void;
};

/** Saves one comment change and reports back once the save (and reload) is done. */
function useCommentFetcher(onDone: () => void, onChanged?: () => void) {
  const { t } = useTranslation("tasks");
  const fetcher = useFetcher<TaskActionResult>();
  const handled = React.useRef<TaskActionResult | null>(null);
  React.useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) return;
    handled.current = result;
    if (result.ok) {
      onDone();
      onChanged?.();
    } else toast.error(result.formError ?? t("comments.error"));
  }, [fetcher.state, fetcher.data, onDone, onChanged, t]);
  return fetcher;
}

function CommentItem({
  taskId,
  comment,
  habitants,
  action,
  onChanged,
}: { comment: TaskComment } & Omit<TaskCommentsProps, "comments">) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const text = useTaskText();
  const [editing, setEditing] = React.useState(false);
  const stopEditing = React.useCallback(() => setEditing(false), []);
  const fetcher = useCommentFetcher(stopEditing, onChanged);
  const busy = fetcher.state !== "idle";
  const author = habitants.find((habitant) => habitant.id === comment.authorHabitantId);
  const when = text.instant(comment.createdAt, { weekday: "short", time: true });

  return (
    <li className={busy ? "flex gap-3 opacity-70" : "flex gap-3"}>
      {author ? (
        <HabitantAvatar habitant={author} size="sm" />
      ) : (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <UserRoundIcon className="size-4" aria-hidden="true" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{comment.authorName ?? t("comments.formerMember")}</span>
          <span className="text-xs text-muted-foreground">
            {when}
            {comment.editedAt && ` · ${t("comments.edited")}`}
          </span>
        </p>
        {editing ? (
          <fetcher.Form method="post" action={action} className="flex flex-col gap-2">
            <input type="hidden" name="intent" value="comment-edit" />
            <input type="hidden" name="id" value={taskId} />
            <input type="hidden" name="commentId" value={comment.id} />
            <Textarea name="body" defaultValue={comment.body} rows={2} maxLength={2000} required aria-label={t("comments.edit")} autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={stopEditing} disabled={busy}>
                {tCommon("actions.cancel")}
              </Button>
              <Button type="submit" size="sm" loading={busy}>
                {tCommon("actions.save")}
              </Button>
            </div>
          </fetcher.Form>
        ) : (
          <p className="whitespace-pre-line break-words">{comment.body}</p>
        )}
      </div>
      {comment.mine && !editing && (
        <div className="flex shrink-0 items-start">
          <Button variant="ghost" size="icon-sm" aria-label={t("comments.edit")} onClick={() => setEditing(true)} disabled={busy}>
            <PencilIcon />
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("comments.delete")} disabled={busy}>
                <Trash2Icon />
              </Button>
            }
            title={t("comments.deleteTitle")}
            confirmLabel={tCommon("actions.delete")}
            cancelLabel={tCommon("actions.cancel")}
            destructive
            onConfirm={() =>
              fetcher.submit({ intent: "comment-delete", id: taskId, commentId: comment.id }, { method: "post", ...(action && { action }) })
            }
          />
        </div>
      )}
    </li>
  );
}

/**
 * The task's thread: who said what, oldest first, and a box to add to it. Everyone in the household can
 * comment; only the author edits or deletes their comment.
 */
export function TaskComments({ taskId, comments, habitants, action = "/tasks", onChanged }: TaskCommentsProps) {
  const { t } = useTranslation("tasks");
  const formRef = React.useRef<HTMLFormElement>(null);
  const reset = React.useCallback(() => formRef.current?.reset(), []);
  const fetcher = useCommentFetcher(reset, onChanged);
  const busy = fetcher.state !== "idle";
  // Shown at once while saving.
  const pendingBody = busy && fetcher.formData?.get("intent") === "comment-add" ? String(fetcher.formData.get("body") ?? "") : null;

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 && !pendingBody ? (
        <p className="text-sm text-muted-foreground">{t("comments.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} taskId={taskId} comment={comment} habitants={habitants} action={action} onChanged={onChanged} />
          ))}
          {pendingBody && (
            <li className="flex gap-3 opacity-60" aria-busy="true">
              <span className="size-7 shrink-0 rounded-full bg-muted" />
              <p className="text-sm whitespace-pre-line">{pendingBody}</p>
            </li>
          )}
        </ol>
      )}
      <fetcher.Form ref={formRef} method="post" action={action} className="flex items-end gap-2">
        <input type="hidden" name="intent" value="comment-add" />
        <input type="hidden" name="id" value={taskId} />
        <Textarea
          name="body"
          rows={2}
          maxLength={2000}
          required
          placeholder={t("comments.placeholder")}
          aria-label={t("comments.add")}
          className="min-h-11 flex-1"
          disabled={busy}
        />
        <Button type="submit" size="icon" aria-label={t("comments.send")} loading={busy}>
          <SendIcon />
        </Button>
      </fetcher.Form>
    </div>
  );
}
