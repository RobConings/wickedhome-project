import * as React from "react";
import { MessageSquareIcon, MoreVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate } from "@/types/date-format";
import { CONVERSATION_RETENTION_DAYS, type AssistantConversationSummary } from "../types/assistant";

type ConversationListProps = {
  conversations: AssistantConversationSummary[];
  activeId: string | null;
  onRename: (id: string, title: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Closes a surrounding sheet on phones. */
  onNavigate?: () => void;
  className?: string;
};

/** The person's conversations, newest first, with "New chat", rename and delete. */
export function ConversationList({ conversations, activeId, onRename, onDelete, onNavigate, className }: ConversationListProps) {
  const { t } = useTranslation("assistant");
  const locale = currentLocale();
  const [renaming, setRenaming] = React.useState<AssistantConversationSummary | null>(null);

  return (
    <nav aria-label={t("conversations.title")} className={cn("flex min-h-0 flex-col gap-2", className)}>
      <Button asChild variant="outline" className="min-h-10 justify-start">
        <NavLink to="/assistant" end onClick={onNavigate}>
          <PlusIcon />
          {t("conversations.new")}
        </NavLink>
      </Button>
      {conversations.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">{t("conversations.empty")}</p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {conversations.map((conversation) => (
            <li key={conversation.id} className={cn("group flex items-center gap-1 rounded-md", conversation.id === activeId && "bg-accent")}>
              <NavLink
                to={`/assistant/${conversation.id}`}
                onClick={onNavigate}
                aria-current={conversation.id === activeId ? "page" : undefined}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{conversation.title || t("conversations.untitled")}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(conversation.lastMessageAt, locale)}</span>
                </span>
              </NavLink>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t("conversations.menu")} className="shrink-0">
                    <MoreVerticalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setRenaming(conversation)}>
                    <PencilIcon />
                    {t("conversations.rename")}
                  </DropdownMenuItem>
                  <ConfirmDialog
                    trigger={
                      <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
                        <Trash2Icon />
                        {t("conversations.delete")}
                      </DropdownMenuItem>
                    }
                    title={t("conversations.deleteTitle")}
                    description={t("conversations.deleteDescription")}
                    confirmLabel={t("conversations.delete")}
                    cancelLabel={t("confirm.cancel")}
                    destructive
                    onConfirm={() => onDelete(conversation.id)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <p className="px-2 text-xs text-muted-foreground">{t("conversations.retention", { days: CONVERSATION_RETENTION_DAYS })}</p>
      <RenameDialog conversation={renaming} onClose={() => setRenaming(null)} onRename={onRename} />
    </nav>
  );
}

function RenameDialog({
  conversation,
  onClose,
  onRename,
}: {
  conversation: AssistantConversationSummary | null;
  onClose: () => void;
  onRename: (id: string, title: string) => Promise<unknown>;
}) {
  const { t } = useTranslation("assistant");
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  return (
    <Dialog open={conversation !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
            if (!conversation || !title) return;
            setBusy(true);
            void onRename(conversation.id, title).finally(() => {
              setBusy(false);
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("conversations.renameTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("conversations.renameTitle")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id}>{t("conversations.titleLabel")}</Label>
            <Input id={id} name="title" defaultValue={conversation?.title ?? ""} maxLength={80} required disabled={busy} />
          </div>
          <DialogFooter>
            <Button type="submit" loading={busy}>
              {t("conversations.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
