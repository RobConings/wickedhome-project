/**
 * The app map for `app_help`: page names come from the app's own navigation and translations (not hand-copied),
 * topics find pages and notes in either language, and the notes stay short. Reads the repo's files only:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/app-map.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/features/auth/types/auth";
import { appNotes, appPages, appText, findInApp } from "./app-map";
import "./core-tools";
import { estimateTokens } from "./tokens";
import { getAssistantTool, type AssistantToolContext } from "./tools";

const user: SessionUser = { id: "u1", email: "rob@example.com", name: "Rob", role: "owner", locale: "nl", householdId: "h1", householdName: "Thuis", habitantId: null };
const ctx = (locale: "en" | "nl"): AssistantToolContext => ({ user: { ...user, locale }, householdId: "h1", locale, signal: new AbortController().signal, channel: "chat" });

describe("app map", () => {
  it("reads the app's texts by i18n key", () => {
    assert.equal(appText("nav.settings", "en"), "Settings");
    assert.equal(appText("common:nav.tasks", "nl"), "Taken");
    assert.ok(appText("integrations:jobs.google-mail.title", "nl"));
    assert.equal(appText("nope:missing.key", "en"), null);
  });

  it("builds the page map from the navigation, the Settings sections and the router", () => {
    const en = appPages("en");
    const paths = en.map((page) => page.path);
    for (const path of ["/", "/tasks", "/expenses", "/settings", "/integrations", "/notifications", "/settings#automations", "/settings#notifications", "/energy/import"]) assert.ok(paths.includes(path), path);
    assert.equal(en.find((page) => page.path === "/tasks")?.name, "Tasks");
    assert.equal(appPages("nl").find((page) => page.path === "/tasks")?.name, "Taken");
    assert.ok(estimateTokens(en.map((page) => `${page.name}: ${page.path}`).join("\n")) < 500, "the whole map stays small");
  });

  it("finds pages and notes for a topic, in Dutch and English", () => {
    const nl = findInApp("waar vind ik de meldingen", "nl");
    assert.ok(nl.pages.some((page) => page.path === "/notifications"), JSON.stringify(nl.pages));
    assert.equal(nl.notes[0]?.title, "Notifications");
    const en = findInApp("automations", "en");
    assert.ok(en.pages.some((page) => page.path === "/settings#automations"), JSON.stringify(en.pages));
    assert.ok(findInApp("instellingen", "en").pages.some((page) => page.path === "/settings"), "a Dutch word finds the English page");
  });

  it("keeps every note short", () => {
    assert.ok(appNotes().length >= 20);
    for (const note of appNotes()) assert.ok(estimateTokens(note.text) <= 110, `${note.title}: ${estimateTokens(note.text)} tokens`);
  });

  it("answers app_help with a topic, and stays backward compatible without one", async () => {
    const help = getAssistantTool("app.help");
    const topic = (await help?.run(ctx("nl"), { topic: "rekeningen uit gmail" })) as { pages: string[]; how: string | null };
    assert.ok(topic.how?.includes("Gmail") || topic.pages.some((page) => page.includes("/integrations")), JSON.stringify(topic));
    const all = (await help?.run(ctx("en"), {})) as { items: unknown[]; note: string };
    assert.ok(Array.isArray(all.items));
    assert.match(all.note, /topic/);
  });
});
