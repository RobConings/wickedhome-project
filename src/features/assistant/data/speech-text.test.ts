/**
 * Spoken chunks for the server voice, and voice names. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/features/assistant/data/speech-text.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpeechChunker, speakable, speechChunks, splitSentences } from "./speech-text";
import { voiceLabelParts } from "./voice-preferences";

/** One chunk per sentence: nothing is merged. */
const sentences = (text: string) => splitSentences(text, { first: 1, target: 1, min: 0 });

describe("splitSentences", () => {
  it("splits sentences on . ! ? and keeps their punctuation", () => {
    assert.deepEqual(sentences("Goedemorgen! Vandaag komt de tandarts. Heb je melk nodig?"), [
      "Goedemorgen!",
      "Vandaag komt de tandarts.",
      "Heb je melk nodig?",
    ]);
  });

  it("doesn't split amounts, dates, times and decimals", () => {
    assert.deepEqual(sentences("De factuur van € 1.234,56 vervalt op 04/10/2026 om 14:30. Daarna 3.5 km rijden."), [
      "De factuur van € 1.234,56 vervalt op 04/10/2026 om 14:30.",
      "Daarna 3.5 km rijden.",
    ]);
  });

  it("doesn't split after abbreviations, initials or a list number", () => {
    assert.deepEqual(sentences("Koop o.a. melk, bv. halfvol. Bel nr. 12 of dhr. Peeters. Vraag J. Janssens."), [
      "Koop o.a. melk, bv. halfvol.",
      "Bel nr. 12 of dhr. Peeters.",
      "Vraag J. Janssens.",
    ]);
    assert.deepEqual(sentences("Fruit, groenten enz. Daarna de rest."), ["Fruit, groenten enz.", "Daarna de rest."]);
    assert.deepEqual(sentences("We need e.g. bread. Then go."), ["We need e.g. bread.", "Then go."]);
    assert.deepEqual(sentences("Op 3 okt. om 9 uur."), ["Op 3 okt. om 9 uur."]);
  });

  it("treats a lower-case word after a dot as the same sentence", () => {
    assert.deepEqual(sentences("Dat kost ong. vijf euro. Klaar."), ["Dat kost ong. vijf euro.", "Klaar."]);
  });

  it("turns markdown lists, bold and links into spoken sentences", () => {
    const text = "Vandaag:\n- 08:30 **Tandarts** voor Lotte\n- PMD gaat buiten\n1. Zie [de kalender](/calendar)";
    assert.deepEqual(sentences(text), ["Vandaag:", "08:30 Tandarts voor Lotte.", "PMD gaat buiten.", "Zie de kalender."]);
  });

  it("treats list items on one line as lines, but not a product", () => {
    assert.deepEqual(sentences("Betalingen: * Mozenno: € 223,72 * Dela: € 42,99"), ["Betalingen:", "Mozenno: € 223,72.", "Dela: € 42,99."]);
    assert.deepEqual(sentences("Een tafel van 3 * 2 m."), ["Een tafel van 3 × 2 m."]);
  });

  it("keeps short sentences together, the first chunk short and every chunk within the limit", () => {
    const chunks = splitSentences("Oké. Ik kijk even. Je hebt vandaag drie taken: de vuilbak buiten zetten, de planten water geven en de was ophangen. Morgen komt de loodgieter om tien uur. Vergeet ook de factuur niet.");
    // The first chunk runs to the first sentence end, comma or colon after 20 characters.
    assert.equal(chunks[0], "Oké. Ik kijk even. Je hebt vandaag drie taken:");
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 600));
    assert.equal(chunks.join(" ").replace(/\s+/g, " "), "Oké. Ik kijk even. Je hebt vandaag drie taken: de vuilbak buiten zetten, de planten water geven en de was ophangen. Morgen komt de loodgieter om tien uur. Vergeet ook de factuur niet.");
  });

  it("splits a very long sentence at commas, and never exceeds the maximum", () => {
    const long = Array.from({ length: 30 }, (_, index) => `item nummer ${index + 1}`).join(", ") + ".";
    const chunks = splitSentences(long);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 300), chunks.map((chunk) => chunk.length).join(","));
    const noSpaces = "x".repeat(1500);
    assert.ok(splitSentences(noSpaces).every((chunk) => chunk.length <= 600));
  });

  it("returns nothing for empty or symbol-only text", () => {
    assert.deepEqual(splitSentences(""), []);
    assert.deepEqual(splitSentences("  \n**\n- \n"), []);
  });

  it("speakable keeps its old behaviour", () => {
    assert.equal(speakable("**Fluvius** € 84,20\n- Telenet"), "Fluvius € 84,20. Telenet");
  });
});

// ── Streaming ─────────────────────────────────────────────────────────────────────────────────────────

const TODAY = "2026-10-04";

const SAMPLES = [
  "Oké. Ik kijk even. Je hebt vandaag drie taken: de vuilbak buiten zetten, de planten water geven en de was ophangen. Morgen komt de loodgieter om tien uur. Vergeet ook de factuur niet.",
  "De factuur van € 1.234,56 vervalt op 04/10/2026 om 14:30. Daarna 3.5 km rijden. Koop o.a. melk, bv. halfvol. Bel nr. 12 of dhr. Peeters. Vraag J. Janssens.",
  "Vandaag:\n- 08:30 **Tandarts** voor Lotte\n- PMD gaat buiten\n1. Zie [de kalender](/calendar) en [de taken](/tasks).\n\nVerder niets.",
  "Morgen (05/10/2026) heb je de volgende betalingen via je eigen rekening: * Mozenno: € 223,72 * Mozenno: € 297,64 * Dela: € 42,99 * Dela: € 28,44",
  "Fluvius € 1.234,56, Telenet € 223,72 en Proximus € 42,99. Totaal: € 1.501,27.",
  "Je hebt vandaag heel veel dingen op je lijst staan voor deze week en volgende week. Fruit, groenten enz. Daarna de rest.",
  Array.from({ length: 30 }, (_, index) => `item nummer ${index + 1}`).join(", ") + ". Klaar.",
  "Een tafel van 3 * 2 m. Op 3, 4 en 5 oktober ben ik weg. Van 10 – 12 uur vergadering.",
  "Tomorrow you have these payments: * Mozenno: € 223,72 * Dela: € 42,99. We need e.g. bread. Then go.",
  'Wat?! Echt... Ja. "Dat zei hij." (Klopt.) Op 3 okt. om 9 uur.',
  "Oké.",
  "",
];

/** A small deterministic random generator, so the piece sizes are the same on every run. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** `text` cut into pieces the way a model streams it: one character, a few, or a word at a time. */
function pieces(text: string, mode: "chars" | "words" | number): string[] {
  if (mode === "chars") return [...text];
  if (mode === "words") return text.split(/(?<=\s)/);
  const next = random(mode);
  const out: string[] = [];
  for (let index = 0; index < text.length; ) {
    const size = 1 + Math.floor(next() * 12);
    out.push(text.slice(index, index + size));
    index += size;
  }
  return out;
}

function streamed(text: string, mode: "chars" | "words" | number, options: ConstructorParameters<typeof SpeechChunker>[0]) {
  const chunker = new SpeechChunker(options);
  const out = pieces(text, mode).flatMap((piece) => chunker.push(piece));
  return [...out, ...chunker.end()];
}

describe("SpeechChunker (streaming)", () => {
  it("gives the same chunks in pieces as for the whole text, spoken and as text", () => {
    for (const text of SAMPLES) {
      const whole = speechChunks(text, "nl", TODAY);
      const raw = splitSentences(text);
      for (const mode of ["chars", "words", 1, 2, 3] as const) {
        assert.deepEqual(streamed(text, mode, { locale: "nl", today: TODAY }), whole, `${JSON.stringify(text)} in ${mode}`);
        assert.deepEqual(streamed(text, mode, {}), raw, `${JSON.stringify(text)} in ${mode} (text)`);
      }
    }
  });

  it("hands out nothing before a safe boundary: amounts, dates and abbreviations stay whole", () => {
    const chunker = new SpeechChunker();
    assert.deepEqual(chunker.push("De factuur van € 1."), []);
    assert.deepEqual(chunker.push("234"), []);
    assert.deepEqual(chunker.push(",56 vervalt op 04/10/20"), []);
    assert.deepEqual(chunker.push("26. Koop bv."), ["De factuur van € 1.234,56 vervalt op 04/10/2026."]);
    // "bv." followed by a lower-case word is not a sentence end.
    assert.deepEqual(chunker.push(" melk."), []);
    assert.deepEqual(chunker.end(), ["Koop bv. melk."]);
  });

  it("keeps every amount, date and abbreviation inside one chunk, whatever the pieces", () => {
    const text = "Je betaalt € 1.234,56 op 04/10/2026, o.a. aan dhr. Peeters, en € 223,72 op 5 okt. om 14:30. Bel nr. 12 a.u.b. morgen terug. Daarna niets meer.";
    for (const mode of ["chars", 4, 5] as const) {
      const chunks = streamed(text, mode, {});
      for (const token of ["€ 1.234,56", "04/10/2026", "o.a. aan", "dhr. Peeters", "€ 223,72", "5 okt. om 14:30", "nr. 12 a.u.b. morgen"]) {
        assert.ok(chunks.some((chunk) => chunk.includes(token)), `${token} split in ${JSON.stringify(chunks)}`);
      }
    }
  });

  it("starts with a short first chunk: up to a comma after 20 characters, at most 60 spoken characters", () => {
    const chunker = new SpeechChunker({ locale: "nl", today: TODAY });
    assert.deepEqual(chunker.push("Je hebt vandaag drie taken"), []);
    assert.deepEqual(chunker.push(", namelijk"), ["Je hebt vandaag drie taken,"]);
    // Measured after normalising: the amount is long once spoken.
    const first = speechChunks("Fluvius € 1.234,56, Telenet € 223,72 en Proximus € 42,99.", "nl", TODAY)[0]!;
    assert.equal(first, "Fluvius duizend tweehonderdvierendertig euro zesenvijftig,");
    assert.ok(first.length <= 60);
  });

  it("cuts a long first sentence without punctuation between two words, never next to a number", () => {
    assert.deepEqual(speechChunks("Je hebt deze week 4 rekeningen te betalen voor in totaal € 512,30.", "nl", TODAY), [
      "Je hebt deze week vier rekeningen te betalen",
      "voor in totaal vijfhonderdtwaalf euro dertig.",
    ]);
    const chunks = speechChunks("Je hebt vandaag heel veel dingen op je lijst staan voor deze week en volgende week. Daarna niets.", "nl", TODAY);
    // Best right before a word that starts a phrase ("voor …").
    assert.equal(chunks[0], "Je hebt vandaag heel veel dingen op je lijst staan");
    assert.equal(chunks[1], "voor deze week en volgende week. Daarna niets.");
    const dated = speechChunks("Op 3 oktober 2026 om 14 uur komt de loodgieter langs voor de verwarmingsketel in de kelder.", "nl", TODAY);
    assert.ok(dated[0]!.length <= 60, dated[0]);
    assert.match(dated[0]!, /^Op drie oktober/);
  });

  it("flushes the rest when the answer ends, and nothing after", () => {
    const chunker = new SpeechChunker({ locale: "nl", today: TODAY });
    assert.deepEqual(chunker.push("Oké."), []);
    assert.deepEqual(chunker.end(), ["Oké."]);
    assert.deepEqual(chunker.push(" Nog iets."), []);
    assert.deepEqual(chunker.end(), []);
  });

  it("waits for a markdown link to be complete", () => {
    const chunker = new SpeechChunker();
    assert.deepEqual(chunker.push("Alles staat in [de kalender van deze maand, ook"), []);
    assert.deepEqual(chunker.push(" de verjaardagen](/calendar), kijk maar."), ["Alles staat in de kalender van deze maand,"]);
    assert.deepEqual(chunker.end(), ["ook de verjaardagen, kijk maar."]);
  });
});

describe("voiceLabelParts", () => {
  it("derives names, regions and male voices from Piper ids", () => {
    assert.deepEqual(voiceLabelParts("nl_BE-nathalie-medium"), { name: "Nathalie", region: "nl_BE", male: false });
    assert.deepEqual(voiceLabelParts("nl_BE-rdh-medium"), { name: "Rdh", region: "nl_BE", male: true });
    assert.deepEqual(voiceLabelParts("en_GB-alba-medium"), { name: "Alba", region: "en_GB", male: false });
    assert.deepEqual(voiceLabelParts("en_GB-northern_english_male-medium"), { name: "Northern English", region: null, male: true });
    assert.deepEqual(voiceLabelParts("en_US-lessac-high"), { name: "Lessac", region: "en_US", male: false });
  });

  it("keeps other servers' ids readable", () => {
    assert.deepEqual(voiceLabelParts("af_bella"), { name: "Af Bella", region: null, male: false });
    assert.deepEqual(voiceLabelParts("alloy"), { name: "Alloy", region: null, male: false });
  });
});
