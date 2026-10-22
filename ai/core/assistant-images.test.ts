/**
 * Images in questions: which ones reach the model as image parts, and their token estimate. No database
 * needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/assistant-images.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMAGE_TURNS, earlierImagesNote, toChatMessages, type LoopMessage } from "./assistant-loop";
import { IMAGE_TOKENS, estimateJsonTokens, estimateMessageTokens } from "./tokens";

const PLAN = "data:image/jpeg;base64,AAAA";
const KITCHEN = "data:image/jpeg;base64,BBBB";

describe("images in toChatMessages", () => {
  it("sends the images of the question as content parts after its text", () => {
    const messages = toChatMessages("system", [{ id: "q1", role: "user", content: "Welke kamers staan hierop?", images: [PLAN] }], { questionNote: "(now 14:05)" });
    assert.deepEqual(messages[1], {
      role: "user",
      content: [
        { type: "text", text: "Welke kamers staan hierop?\n\n(now 14:05)" },
        { type: "image_url", image_url: { url: PLAN } },
      ],
    });
  });

  it("an image without text has no empty text part", () => {
    const messages = toChatMessages("system", [{ id: "q1", role: "user", content: "", images: [PLAN] }]);
    assert.deepEqual(messages[1], { role: "user", content: [{ type: "image_url", image_url: { url: PLAN } }] });
  });

  it("follow-up questions still see the latest images; older images become a note", () => {
    const history: LoopMessage[] = [
      { id: "q1", role: "user", content: "Gelijkvloers", images: [PLAN] },
      { id: "a1", role: "assistant", content: "Inkom, Keuken…" },
      { id: "q2", role: "user", content: "En de verdieping", images: [KITCHEN] },
      { id: "a2", role: "assistant", content: "Bureau, Slaapkamer 2…" },
      { id: "q3", role: "user", content: "Maak ze aan" },
    ];
    const messages = toChatMessages("system", history);
    assert.equal(messages[1]?.content, `Gelijkvloers\n\n${earlierImagesNote(1)}`);
    assert.deepEqual(messages[3]?.content, [
      { type: "text", text: "En de verdieping" },
      { type: "image_url", image_url: { url: KITCHEN } },
    ]);
    assert.equal(messages[5]?.content, "Maak ze aan");
  });
});

describe("old images", () => {
  it("an image older than the last IMAGE_TURNS questions is no longer sent", () => {
    const history: LoopMessage[] = [{ id: "q0", role: "user", content: "Het plan", images: [PLAN] }];
    for (let turn = 1; turn <= IMAGE_TURNS; turn++) {
      history.push({ id: `a${turn}`, role: "assistant", content: "Ok" }, { id: `q${turn}`, role: "user", content: `Vraag ${turn}` });
    }
    assert.equal(toChatMessages("system", history)[1]?.content, `Het plan\n\n${earlierImagesNote(1)}`);
    assert.ok(Array.isArray(toChatMessages("system", history.slice(0, -2))[1]?.content), "still within the window");
  });
});

describe("estimateMessageTokens", () => {
  it("counts an image as a fixed budget, never its base64 length", () => {
    const huge = `data:image/jpeg;base64,${"A".repeat(500_000)}`;
    const estimate = estimateMessageTokens({ role: "user", content: [{ type: "text", text: "Hoi" }, { type: "image_url", image_url: { url: huge } }] });
    assert.ok(estimate >= IMAGE_TOKENS && estimate < IMAGE_TOKENS + 50, `got ${estimate}`);
  });

  it("plain messages are estimated as before", () => {
    const message = { role: "user", content: "Wat is het weer morgen?" };
    assert.equal(estimateMessageTokens(message), estimateJsonTokens(message));
  });
});
