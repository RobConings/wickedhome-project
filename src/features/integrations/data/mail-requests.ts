import { api, resourcePath, withQuery } from "@/lib/api-client";
import type { ProjectMailThreads } from "../types/mail";

/** Your own mails linked to a project (`GET /api/mail/threads`). */
export const fetchProjectMailThreads = (projectId: string) => api.get<ProjectMailThreads>(withQuery("/mail/threads", { projectId }));

/** Removes one of your links (the mail stays in Gmail). */
export const unlinkMailThread = (id: string) => api.delete(resourcePath("/mail/threads")(id));
