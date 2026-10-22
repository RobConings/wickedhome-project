import { api } from "@/lib/api-client";
import type { AuditPage, AuditQuery } from "../types/audit";

/** One page of the activity log; filters, search and the cursor go in the query string. */
export function fetchAuditPage(query: AuditQuery = {}): Promise<AuditPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return api.get<AuditPage>(`/audit${search ? `?${search}` : ""}`);
}

/** What `ActivitySection` needs from the API; stories pass a fake. */
export type AuditClient = { list: (query: AuditQuery) => Promise<AuditPage> };

export const auditClient: AuditClient = { list: fetchAuditPage };
