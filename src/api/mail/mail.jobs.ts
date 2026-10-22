import { registerJob } from "../jobs/job-registry";
import { checkAllReplies } from "./mail-replies";

registerJob({
  id: "mail.replies",
  // Every 10 minutes, at :05, :15… (away from the quarter-hour calendar sync).
  schedule: "5-55/10 * * * *",
  titleKey: "integrations:jobs.mail-replies.title",
  descriptionKey: "integrations:jobs.mail-replies.description",
  timeoutMs: 5 * 60 * 1000,
  run: async ({ signal, log }) => {
    const { checked, replies, failed } = await checkAllReplies({ signal, log });
    const summary = `${checked} linked mail thread(s) checked, ${replies} new repl${replies === 1 ? "y" : "ies"}`;
    if (failed > 0) throw new Error(`${summary}, ${failed} problem(s)`);
    return { summary };
  },
});
