/**
 * Which skills a mail question loads, with the real skills, and what mail_compose accepts. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/mail/routing.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "@ai/skills/index";
import { questionSkillIds } from "@ai/core/routing";
import { skillsForRole } from "@ai/core/skills";
import { getAssistantTool, toOpenAiTools } from "@ai/core/tools";

const route = (text: string) => questionSkillIds(text, skillsForRole("owner"));

describe("mail routing", () => {
  it("a mail to a contractor about projects loads mail and projects, not integrations (LM Studio log 2026-10-09)", () => {
    const ids = route(
      "Zowel voor het project vaatwas + leidingen alsook het project waterpomp + aansluitingen moeten we een mail opstellen naar Jan om een offerte te krijgen. Kunnen we 1 mail hieromtrent sturen voor beide projecten in eens en 1 mail linken aan beide projecten?",
    );
    assert.ok(ids.includes("mail"), ids.join(", "));
    assert.ok(ids.includes("projects"), ids.join(", "));
    assert.ok(!ids.includes("integrations"), ids.join(", "));
  });

  it("a follow-up about the mail's content stays out of integrations", () => {
    assert.ok(!route("We moeten eerst de context verzamelen wat er allemaal in de mail moet staan voor we die versturen").includes("integrations"));
  });

  it("bills found in mail still go to integrations", () => {
    assert.ok(route("Welke facturen uit de mail staan nog open?").includes("integrations"));
    assert.ok(route("Synchroniseer mijn mailbox").includes("integrations"));
  });
});

describe("mail_compose input", () => {
  const compose = getAssistantTool("mail.compose");

  it("takes one recipient as a plain string, as local models send it", () => {
    const to = (input: unknown) => (compose?.input.parse(input) as { to: string[] }).to;
    assert.deepEqual(to({ to: "Jan Brusselaers", body: "Beste Jan" }), ["Jan Brusselaers"]);
    assert.deepEqual(to({ to: ["Jan", "Piet"], body: "x" }), ["Jan", "Piet"]);
    assert.deepEqual(to({ body: "x" }), []);
  });

  it("sends the model no validation-only keys", () => {
    const wire = JSON.stringify(toOpenAiTools(compose ? [compose] : []));
    assert.ok(!/maxLength|minLength|maxItems|minItems|"maximum"|"minimum"/.test(wire), wire);
    assert.match(wire, /"pattern"/); // reply_to keeps its id pattern
  });
});
