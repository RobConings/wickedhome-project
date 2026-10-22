import * as React from "react";
import { MessagesSquareIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useRevalidator } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InlineAlert } from "../components/inline-alert";
import { SkeletonList } from "../components/loading-state";
import { PageHeader } from "../components/page-header";
import { PageContainer } from "../components/page-container";
import { AssistantChat } from "../components/assistant-chat";
import { AssistantIntegrationCard } from "../components/assistant-integration-card";
import { ConversationList } from "../components/conversation-list";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import type { AssistantLoaderData } from "../data/assistant-loaders";
import type { AssistantConversationSummary } from "../types/assistant";

type AssistantScreenProps = {
  data: AssistantLoaderData;
  client?: AssistantClient;
};

/**
 * `/assistant`: the conversations (a sidebar on large screens, a sheet on phones) and the chat. While the
 * assistant isn't configured it shows the setup card instead.
 */
export function AssistantScreen({ data, client = assistantClient }: AssistantScreenProps) {
  const { t } = useTranslation("assistant");
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [listOpen, setListOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const created = React.useRef<string | null>(null);
  const activeId = data.conversation?.id ?? null;

  // The chat fills the screen and scrolls inside: the page itself must not scroll (on phones it would carry
  // the question field away once the conversation reached its end).
  const fullScreen = data.status.configured;
  React.useEffect(() => {
    if (!fullScreen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [fullScreen]);

  if (!data.status.configured) {
    return (
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title={t("page.title")} description={t("page.description")} />
        <AssistantIntegrationCard data={data.status} client={client} showOpenLink={false} showTokens={false} />
      </PageContainer>
    );
  }

  const rename = (id: string, title: string) =>
    client
      .renameConversation(id, title)
      .then(() => revalidator.revalidate())
      .catch(() => toast.error(t("errors.generic")));
  const remove = (id: string) =>
    client
      .deleteConversation(id)
      .then(async () => {
        toast.success(t("conversations.deleted"));
        if (id === activeId) await navigate("/assistant", { replace: true });
        else await revalidator.revalidate();
      })
      .catch(() => toast.error(t("errors.generic")));

  const list = (onNavigate?: () => void) => (
    <React.Suspense fallback={<SkeletonList rows={6} />}>
      <DeferredList promise={data.conversations} activeId={activeId} onRename={rename} onDelete={remove} onNavigate={onNavigate} />
    </React.Suspense>
  );

  return (
    // Exactly the screen below the top bar: the negative margin takes back <main>'s safe-area padding (the
    // question field pads the safe area itself), which otherwise made the page taller than the screen.
    <div className="-mb-[env(safe-area-inset-bottom)] flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] overflow-hidden lg:grid lg:h-dvh lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col gap-3 border-r p-3 lg:flex">
        <h2 className="px-1 text-sm font-semibold">{t("conversations.title")}</h2>
        {list()}
      </aside>

      <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 pt-2 sm:px-4 lg:pt-4">
        <header className="flex items-center gap-1 pb-2">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("conversations.open")} onClick={() => setListOpen(true)}>
            <MessagesSquareIcon />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{data.conversation?.title || t("page.title")}</h1>
          {activeId && (
            <Button asChild variant="ghost" size="icon" aria-label={t("conversations.new")}>
              <Link to="/assistant">
                <PlusIcon />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={t("card.title")} onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
          </Button>
        </header>
        {/* A new key per conversation: the chat starts from that conversation's stored messages. */}
        <AssistantChat
          key={activeId ?? "new"}
          conversationId={activeId}
          initialMessages={data.conversation?.messages}
          running={data.conversation?.running ?? false}
          serverStt={data.status.stt}
          vision={data.status.vision ?? false}
          serverTts={Boolean(data.status.tts?.configured && data.status.tts.ok)}
          client={client}
          autoFocus={!activeId}
          onConversationCreated={(id) => {
            created.current = id;
          }}
          onSettled={() => {
            // A new conversation moves to its own URL once the answer is complete (everything is stored by
            // then, so the chat reloads unchanged); otherwise only the list refreshes.
            const id = created.current;
            created.current = null;
            if (id && id !== activeId) void navigate(`/assistant/${id}`, { replace: true, preventScrollReset: true });
            else void revalidator.revalidate();
          }}
        />
      </section>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="flex w-80 flex-col gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <SheetHeader className="p-0">
            <SheetTitle>{t("conversations.title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("conversations.title")}</SheetDescription>
          </SheetHeader>
          {list(() => setListOpen(false))}
        </SheetContent>
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:max-w-lg">
          <SheetHeader className="p-0 pr-10">
            <SheetTitle>{t("card.title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("card.description")}</SheetDescription>
          </SheetHeader>
          <AssistantIntegrationCard data={data.status} client={client} showOpenLink={false} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DeferredList({
  promise,
  ...props
}: {
  promise: Promise<AssistantConversationSummary[] | null>;
  activeId: string | null;
  onRename: (id: string, title: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation("assistant");
  const conversations = React.use(promise);
  if (!conversations) return <InlineAlert tone="error">{t("conversations.loadFailed")}</InlineAlert>;
  return <ConversationList conversations={conversations} {...props} className="flex-1" />;
}
