/**
 * The settings and automations skills: who may change what (as the Settings page), notifications for everyone
 * and only their own, the activity log for owners and adults, and preferences without push keys or endpoints.
 * No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/settings/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NotificationSettings } from "@/features/notifications/types/notifications";
import { getAssistantTool, toolsFor } from "@ai/core/tools";
import "@ai/skills";
import { prefsSummary } from "./notifications";

const rules = (name: string) => {
  const tool = getAssistantTool(name);
  assert.ok(tool, `${name} is registered`);
  return [tool.permission, tool.confirm, [...tool.roles].sort().join(",")];
};

describe("settings skill", () => {
  it("mirrors the Settings page's roles", () => {
    assert.deepEqual(rules("settings.overview"), ["read", "never", "adult,child,owner"]);
    assert.deepEqual(rules("settings.set_address"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("settings.set_weather_provider"), ["write", "first-time", "adult,owner"]);
    assert.deepEqual(rules("settings.set_language"), ["write", "first-time", "adult,child,owner"]);
    assert.deepEqual(rules("settings.activity"), ["read", "never", "adult,owner"]);
    for (const name of ["settings.notifications", "settings.notification_prefs"]) assert.deepEqual(rules(name), ["read", "never", "adult,child,owner"], name);
    for (const name of ["settings.mark_read", "settings.set_notification_prefs"]) assert.deepEqual(rules(name), ["write", "first-time", "adult,child,owner"], name);
  });

  it("keeps the activity log and the household's address away from children", () => {
    const child = toolsFor("child").map((tool) => tool.name);
    for (const name of ["settings.activity", "settings.set_address", "automations.run", "automations.set_enabled"]) assert.ok(!child.includes(name), name);
    assert.ok(child.includes("automations.list"), "children may look at the automations");
  });

  it("lets owners and adults run and pause automations", () => {
    assert.deepEqual(rules("automations.list"), ["read", "never", "adult,child,owner"]);
    assert.deepEqual(rules("automations.run"), ["write", "first-time", "adult,owner"]);
    assert.deepEqual(rules("automations.set_enabled"), ["write", "always", "adult,owner"]);
  });

  it("summarises notification preferences without the push key or device endpoints", () => {
    const settings: NotificationSettings = {
      preferences: { quietHours: { enabled: true, start: "22:00", end: "07:00" }, kinds: { "waste.bins": { enabled: false } } },
      kinds: [
        { id: "waste.bins", group: "household", titleKey: "waste:notifications.bins.title", descriptionKey: "waste:notifications.bins.description", urgent: false, times: ["task", "19:00"], defaultTime: "task", scoped: false, defaultEnabled: true },
      ],
      devices: [{ id: "d1", label: "iPhone · Safari", endpoint: "https://web.push.apple.com/secret-endpoint", createdAt: "2026-10-01T10:00:00.000Z", lastSuccessAt: null, failureCount: 0 }],
      publicKey: "BPUBLICKEYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      keyStorage: "plain",
    };
    const result = prefsSummary(settings, "en");
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /secret-endpoint|BPUBLICKEY|plain|https?:/);
    assert.equal(result.quietHours, "22:00–07:00");
    assert.equal(result.kinds[0]?.on, false);
    assert.deepEqual(result.pushDevices, ["iPhone · Safari"]);
  });
});
