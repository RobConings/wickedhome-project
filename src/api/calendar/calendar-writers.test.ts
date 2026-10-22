/**
 * Calendar writers: a new event in another calendar (a person's Google calendar) instead of the household's.
 * Uses a fake writer, no database:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/calendar/calendar-writers.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarEventInputSchema, type CalendarEventInput } from "@/features/calendar/types/calendar";
import { HttpError } from "../lib/http";
import { calendarTargets, registerCalendarWriter, writerFor } from "./calendar-sources";
import { createEventIn } from "./calendar.service";

const created: { userId: string; targetId: string; input: CalendarEventInput }[] = [];

registerCalendarWriter({
  id: "fake",
  targets: async ({ userId }) => (userId === "u1" ? [{ id: "work", label: "rob@work.example", color: "#c0ca33", account: "rob@work.example" }] : []),
  create: async ({ userId }, targetId, input) => {
    created.push({ userId, targetId, input });
  },
});

const input = (extra: Record<string, unknown> = {}) =>
  calendarEventInputSchema.parse({ title: "Refinement", startDate: "2026-10-07", endDate: "2026-10-07", startTime: "14:00", endTime: "15:00", ...extra });

describe("calendar writers", () => {
  it("lists a person's targets with the writer's prefix", async () => {
    assert.deepEqual(await calendarTargets({ householdId: "h1", userId: "u1" }), [
      { id: "fake:work", label: "rob@work.example", color: "#c0ca33", account: "rob@work.example" },
    ]);
    assert.deepEqual(await calendarTargets({ householdId: "h1", userId: "u2" }), []);
  });

  it("finds the writer of a target id (the target id may contain colons)", () => {
    assert.equal(writerFor("fake:a:b")?.id, "a:b");
    assert.equal(writerFor("nobody:x"), null);
    assert.equal(writerFor("household"), null);
  });

  it("an external target goes to its writer as a plain event, and isn't a household event", async () => {
    const result = await createEventIn("h1", "u1", input({ target: "fake:work", category: "work", participantIds: ["p1"], kind: "store_visit", shopId: "s1" }));
    assert.equal(result, null);
    const call = created.at(-1);
    assert.equal(call?.userId, "u1");
    assert.equal(call?.targetId, "work");
    assert.deepEqual([call?.input.kind, call?.input.category, call?.input.participantIds, call?.input.shopId], ["event", null, [], null]);
    assert.equal(call?.input.startTime, "14:00");
  });

  it("an unknown target is a validation error on `target`", async () => {
    await assert.rejects(createEventIn("h1", "u1", input({ target: "nobody:x" })), (error: unknown) => error instanceof HttpError && error.status === 400);
  });
});
