import { api, withQuery } from "@/lib/api-client";
import type { AuditPage, AuditQuery } from "../types/audit";

/** One page of the activity log; filters, search and the cursor go in the query string. */
export function fetchAuditPage(query: AuditQuery = {}): Promise<AuditPage> {
  return api.get<AuditPage>(withQuery("/audit", query));
}

/** What `ActivitySection` needs from the API; stories pass a fake. */
export type AuditClient = { list: (query: AuditQuery) => Promise<AuditPage> };

export const auditClient: AuditClient = { list: fetchAuditPage };
