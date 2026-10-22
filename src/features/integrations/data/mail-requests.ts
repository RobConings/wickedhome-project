import { api } from "../lib/api-client";
import type { ProjectMailThreads } from "../types/mail";

/** Your own mails linked to a project (`GET /api/mail/threads`). */
export const fetchProjectMailThreads = (projectId: string) => api.get<ProjectMailThreads>(`/mail/threads?projectId=${encodeURIComponent(projectId)}`);

/** Removes one of your links (the mail stays in Gmail). */
export const unlinkMailThread = (id: string) => api.delete(`/mail/threads/${encodeURIComponent(id)}`);
