# Audit log (Settings → Activity)

Who changed what in the household, and through which channel. Code: `src/api/audit` (service, route, retention
job), `src/features/audit` (contract, Settings section, EN/NL). Data: `prisma/schema/audit.prisma`
(`AuditEntry` → `audit_entries`).

## What an entry holds

| Field | |
|---|---|
| who | `userId` (null for jobs; set to null when the account is removed) and `actorName`, the display name at the time (kept) |
| channel | `app` (the UI), `assistant` (chat and voice), `mcp` (an MCP client with a personal token), `job` (a scheduled job; the name is the job id) |
| what | `action`, `<domain>.<verb>`: `account.role_changed`, `alarm.armed_away`… Assistant and MCP writes use the tool's name (`tasks.complete`) |
| target | `targetType` + `targetId` + `targetLabel` (`account` / `invite` / `alarm` / `payment_account` / `expense`, the tool's feature for tool calls) |
| summary | one line: "Role: adult → child", "2026-10-03: set to € 8.000,00 (+€ 123,45)", or the assistant's confirmation text |

**No secrets**: alarm codes, passwords, link and MCP tokens are never passed in. As a safety net, `toAuditRow`
(`audit-entry.ts`) hides anything that looks like one (`wh_mcp_…`, `Bearer …`, `code: …`, `password=…`, 32+
character random strings), makes every text one line and cuts it to size.

## Recording

```ts
import { appActor, audit, jobActor } from "../audit/audit.service";

await audit(appActor(currentUser(req)), { action: "account.disabled", targetType: "account", targetId: id, targetLabel: name });
await audit(jobActor(householdId, "expenses.auto-pay"), { action: "expense.auto_paid", targetType: "expense", targetId, targetLabel: payee });
```

Call it after the change is committed. It never throws (a failed write is logged as `[audit] …`), so the audit
log can't break the action. Add new action keys to `AUDIT_ACTIONS` and `actions.<domain>.<verb>` in the locales;
unknown keys show their summary.

What is recorded today:

| Where | Actions |
|---|---|
| Assistant + MCP: the tool runner (`runTool` → `auditToolCall`, wired in `ai/core/tool-audit.ts`) | every successful **write** or **sensitive** tool call (not reads, not failed calls, not MCP calls without `confirm: true`) |
| Alarm (`ha-alarm.ts`, mirrors the alarm action log) | `alarm.armed_home`, `alarm.armed_away`, `alarm.disarmed`; refused, failed or rate-limited attempts as `alarm.attempt_failed` with the reason. Channel from the actor (UI → app, assistant / voice → assistant, MCP → mcp). The arm tools set `auditedByService` so the runner doesn't record them twice |
| Accounts (`accounts.service.ts`, `links.service.ts`) | `account.role_changed`, `account.disabled` / `enabled`, `account.signed_out`, `account.reset_link`, `account.removed`, `invite.created`, `invite.revoked`, `invite.accepted` (by the new account) |
| Money (`money.service.ts`, from the routes) | `payment_account.corrected` ("Set real balance"), `payment_account.correction_deleted` |
| Jobs | `expense.auto_paid` (`expenses.auto-pay`) |

Everyday UI edits (tasks, expenses, shopping…) are not recorded yet; add `audit(appActor(user), …)` in a
route when it's worth it.

## Settings → Activity

Owners and adults (`GET /api/audit`, `requireRole("owner", "adult")`). A `GeneralList`, newest first, 50 per
page with **Show older** (cursor = time + id): filters for channel, person (accounts that appear in the log) and
kind (the action's domain), and a server-side search over name, action, target and summary (every word must
match, case-insensitive). The section loads its own data (`ActivitySection`, fake client in the stories).

`GET /api/audit?channel=&userId=&action=&q=&cursor=&limit=` → `{ entries, nextCursor, people, actions }`;
`action` is an exact key or a domain prefix ending in a dot (`alarm.`).

## Retention

The job `audit.prune` (daily 03:55, catch-up after a restart, Settings → Automations) deletes entries older than
**365 days** (`AUDIT_RETENTION_DAYS`).

## Tests

`src/api/audit/audit.test.ts`: cleaning and redaction, cursor, search words, retention, and which tool calls the
runner records (writes from chat and MCP yes; reads, failures and `auditedByService` tools no; a failing audit
doesn't fail the action).
