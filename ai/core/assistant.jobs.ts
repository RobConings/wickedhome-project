import { CONVERSATION_RETENTION_DAYS } from "@/features/assistant/types/assistant";
import { registerJob } from "@/api/jobs/job-registry";
import { deleteOldConversations, deleteUnsentImages } from "./assistant.service";

/**
 * Retention: conversations without activity for 90 days are deleted with their messages (and images), every
 * night; so are images uploaded a day ago but never sent with a question.
 */
registerJob({
  id: "assistant.cleanup",
  schedule: "40 3 * * *",
  titleKey: "assistant:jobs.cleanup.title",
  descriptionKey: "assistant:jobs.cleanup.description",
  runOnStartupIfMissed: true,
  run: async ({ log }) => {
    const count = await deleteOldConversations(CONVERSATION_RETENTION_DAYS);
    log(`${count} conversations older than ${CONVERSATION_RETENTION_DAYS} days deleted`);
    log(`${await deleteUnsentImages()} unsent images deleted`);
    return { summary: `${count} old conversations removed` };
  },
});
