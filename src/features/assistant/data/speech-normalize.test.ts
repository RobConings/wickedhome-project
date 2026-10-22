/**
 * The spoken form of answers (amounts, dates, times, numbers, units, codes, symbols). No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/features/assistant/data/speech-normalize.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeForSpeech, numberToWords } from "./speech-normalize";
import { speechChunks } from "./speech-text";

const TODAY = "2026-10-04";
const nl = (text: string) => normalizeForSpeech(text, "nl", TODAY);
const en = (text: string) => normalizeForSpeech(text, "en", TODAY);

const EXAMPLE = "Morgen (05/10/2026) heb je de volgende betalingen via je eigen rekening: * Mozenno: € 223,72 * Mozenno: € 297,64 * Dela: € 42,99 * Dela: € 28,44";

describe("numberToWords (Dutch)", () => {
  const cases: [number, string][] = [
    [0, "nul"], [1, "één"], [2, "twee"], [11, "elf"], [12, "twaalf"], [13, "dertien"], [14, "veertien"], [18, "achttien"],
    [19, "negentien"], [20, "twintig"], [21, "eenentwintig"], [22, "tweeëntwintig"], [23, "drieëntwintig"], [28, "achtentwintig"],
    [42, "tweeënveertig"], [72, "tweeënzeventig"], [83, "drieëntachtig"], [99, "negenennegentig"], [100, "honderd"],
    [101, "honderdeen"], [110, "honderdtien"], [122, "honderdtweeëntwintig"], [223, "tweehonderddrieëntwintig"],
    [999, "negenhonderdnegenennegentig"], [1000, "duizend"], [1001, "duizend een"], [1100, "duizend honderd"],
    [2026, "tweeduizend zesentwintig"], [2350, "tweeduizend driehonderdvijftig"], [12500, "twaalfduizend vijfhonderd"],
    [100000, "honderdduizend"], [1_000_000, "een miljoen"],
    [1_234_567, "een miljoen tweehonderdvierendertigduizend vijfhonderdzevenenzestig"], [2_000_000_000, "twee miljard"],
  ];
  for (const [n, words] of cases) it(`${n} → ${words}`, () => assert.equal(numberToWords(n, "nl"), words));

  it("keeps 'een' inside a number and 'één' only on its own", () => {
    assert.equal(numberToWords(1, "nl", false), "een");
    assert.equal(numberToWords(31, "nl"), "eenendertig");
  });

  it("reads numbers it can't say as digits", () => {
    assert.equal(numberToWords(-1, "nl"), "één");
    assert.equal(numberToWords(1.5, "nl"), "één vijf");
    assert.equal(numberToWords(1e13, "nl"), `één ${"nul ".repeat(13).trim()}`);
  });
});

describe("numberToWords (English)", () => {
  const cases: [number, string][] = [
    [0, "zero"], [1, "one"], [11, "eleven"], [15, "fifteen"], [19, "nineteen"], [20, "twenty"], [22, "twenty-two"],
    [72, "seventy-two"], [99, "ninety-nine"], [100, "one hundred"], [101, "one hundred one"], [110, "one hundred ten"],
    [223, "two hundred twenty-three"], [999, "nine hundred ninety-nine"], [1000, "one thousand"], [1001, "one thousand one"],
    [2026, "two thousand twenty-six"], [12500, "twelve thousand five hundred"],
    [1_234_567, "one million two hundred thirty-four thousand five hundred sixty-seven"],
  ];
  for (const [n, words] of cases) it(`${n} → ${words}`, () => assert.equal(numberToWords(n, "en"), words));
});

describe("the example answer", () => {
  it("reads naturally in Dutch", () => {
    assert.equal(
      nl(EXAMPLE),
      "Morgen heb je de volgende betalingen via je eigen rekening: Mozenno: tweehonderddrieëntwintig euro tweeënzeventig. " +
        "Mozenno: tweehonderdzevenennegentig euro vierenzestig. Dela: tweeënveertig euro negenennegentig. Dela: achtentwintig euro vierenveertig",
    );
  });

  it("reads naturally in English", () => {
    assert.equal(
      en("Tomorrow (05/10/2026) you have these payments from your own account: * Mozenno: € 223,72 * Mozenno: € 297,64 * Dela: € 42,99 * Dela: € 28,44"),
      "Tomorrow you have these payments from your own account: Mozenno: two hundred twenty-three euros seventy-two. " +
        "Mozenno: two hundred ninety-seven euros sixty-four. Dela: forty-two euros ninety-nine. Dela: twenty-eight euros forty-four",
    );
  });

  it("comes out the same through the splitter, as list lines or on one line", () => {
    const expected = [
      "Morgen heb je de volgende betalingen via je eigen rekening:",
      "Mozenno: tweehonderddrieëntwintig euro tweeënzeventig. Mozenno: tweehonderdzevenennegentig euro vierenzestig. Dela: tweeënveertig euro negenennegentig. Dela: achtentwintig euro vierenveertig.",
    ];
    assert.deepEqual(speechChunks(EXAMPLE, "nl", TODAY), expected);
    const asList = "Morgen (05/10/2026) heb je de volgende betalingen via je eigen rekening:\n* **Mozenno**: € 223,72\n* Mozenno: € 297,64\n- Dela: € 42,99\n- Dela: € 28,44";
    assert.deepEqual(speechChunks(asList, "nl", TODAY), expected);
  });
});

describe("money", () => {
  it("Dutch amounts", () => {
    assert.equal(nl("€ 223,72"), "tweehonderddrieëntwintig euro tweeënzeventig");
    assert.equal(nl("€ 28,00"), "achtentwintig euro");
    assert.equal(nl("€ 0,50"), "vijftig cent");
    assert.equal(nl("€ 0,01"), "één cent");
    assert.equal(nl("€ 1,01"), "één euro één");
    assert.equal(nl("€ 1,00"), "één euro");
    assert.equal(nl("€ 21,00"), "eenentwintig euro");
    assert.equal(nl("€ 0,00"), "nul euro");
    assert.equal(nl("€ 12.500"), "twaalfduizend vijfhonderd euro");
    assert.equal(nl("€ 1.234,56"), "duizend tweehonderdvierendertig euro zesenvijftig");
    assert.equal(nl("€ 1.234.567,89"), "een miljoen tweehonderdvierendertigduizend vijfhonderdzevenenzestig euro negenentachtig");
    assert.equal(nl("€1,5"), "één euro vijftig");
    assert.equal(nl("€ 28,-"), "achtentwintig euro");
    assert.equal(nl("2,50 euro"), "twee euro vijftig");
    assert.equal(nl("2,50 €"), "twee euro vijftig");
    assert.equal(nl("EUR 5"), "vijf euro");
  });

  it("negative amounts", () => {
    assert.equal(nl("-€ 5,00"), "min vijf euro");
    assert.equal(nl("€ -5,00"), "min vijf euro");
    assert.equal(nl("Saldo: − € 12,30."), "Saldo: min twaalf euro dertig.");
    assert.equal(en("-€ 5,00"), "minus five euros");
    assert.equal(en("€ -0,50"), "minus fifty cents");
  });

  it("English amounts", () => {
    assert.equal(en("€ 223,72"), "two hundred twenty-three euros seventy-two");
    assert.equal(en("€ 0,50"), "fifty cents");
    assert.equal(en("€ 0,01"), "one cent");
    assert.equal(en("€ 1,00"), "one euro");
    assert.equal(en("€ 1,01"), "one euro one");
    assert.equal(en("€ 12.500"), "twelve thousand five hundred euros");
    assert.equal(en("€1,234.56"), "one thousand two hundred thirty-four euros fifty-six");
  });

  it("ranges and prices per unit", () => {
    assert.equal(nl("tussen € 20 – € 30"), "tussen twintig euro en dertig euro");
    assert.equal(nl("€ 20–30"), "van twintig euro tot dertig euro");
    assert.equal(nl("€ 0,32/kWh"), "tweeëndertig cent per kilowattuur");
    assert.equal(en("€ 9,99/month"), "nine euros ninety-nine per month");
  });
});

describe("dates", () => {
  it("Dutch dates, the year only when it isn't this year", () => {
    assert.equal(nl("op 05/10/2026"), "op vijf oktober");
    assert.equal(nl("op 05/10/2027"), "op vijf oktober tweeduizend zevenentwintig");
    assert.equal(nl("op 05/10"), "op vijf oktober");
    assert.equal(nl("op 2026-10-05"), "op vijf oktober");
    assert.equal(nl("op 2025-01-01"), "op één januari tweeduizend vijfentwintig");
    assert.equal(nl("op 5-10-2026"), "op vijf oktober");
    assert.equal(nl("op 01/03/1990"), "op één maart negentienhonderdnegentig");
  });

  it("weekday abbreviations before a date", () => {
    assert.equal(nl("ma 05/10"), "maandag vijf oktober");
    assert.equal(nl("Za 03/10/2026"), "Zaterdag drie oktober");
    assert.equal(nl("vrijdag 09/10"), "vrijdag negen oktober");
    assert.equal(en("Mon 05/10"), "Monday the fifth of October");
    assert.equal(nl("thema 05/10"), "thema vijf oktober");
  });

  it("drops a date in brackets after today / tomorrow", () => {
    assert.equal(nl("Morgen (05/10/2026) komt de loodgieter."), "Morgen komt de loodgieter.");
    assert.equal(nl("vandaag (zo 04/10/2026)"), "vandaag");
    assert.equal(nl("overmorgen (06/10)"), "overmorgen");
    assert.equal(en("Today (Sun 04/10/2026) is free."), "Today is free.");
    assert.equal(en("tomorrow (2026-10-05)"), "tomorrow");
    assert.equal(nl("dinsdag (06/10/2026)"), "dinsdag (zes oktober)");
  });

  it("English dates", () => {
    assert.equal(en("on 05/10/2026"), "on the fifth of October");
    assert.equal(en("on 05/10/2027"), "on the fifth of October twenty twenty-seven");
    assert.equal(en("on 01/01/2005"), "on the first of January two thousand five");
    assert.equal(en("on 22/10"), "on the twenty-second of October");
    assert.equal(en("on 2026-10-03"), "on the third of October");
    assert.equal(en("October 5th, 2027"), "the fifth of October twenty twenty-seven");
  });

  it("dates written with month names", () => {
    assert.equal(nl("Op 3 okt. om 9 uur."), "Op drie oktober om negen uur.");
    assert.equal(nl("5 oktober 2026"), "vijf oktober");
    assert.equal(nl("1 mei 2027"), "één mei tweeduizend zevenentwintig");
    assert.equal(en("5 October"), "the fifth of October");
  });

  it("date ranges", () => {
    assert.equal(nl("05/10–07/10"), "van vijf tot zeven oktober");
    assert.equal(nl("van 05/10 - 07/10"), "van vijf tot zeven oktober");
    assert.equal(nl("28/09/2026 – 04/10/2026"), "van achtentwintig september tot vier oktober");
    assert.equal(nl("05/10/2027–07/10/2027"), "van vijf tot zeven oktober tweeduizend zevenentwintig");
    assert.equal(nl("30/12/2026–02/01/2027"), "van dertig december tot twee januari tweeduizend zevenentwintig");
    assert.equal(nl("za 03/10 – zo 04/10"), "van zaterdag drie oktober tot zondag vier oktober");
    assert.equal(en("05/10–07/10"), "from the fifth to the seventh of October");
    assert.equal(en("28/09/2026 – 04/10/2026"), "from the twenty-eighth of September to the fourth of October");
  });

  it("a date with a time", () => {
    assert.equal(nl("05/10/2026 14:30"), "vijf oktober om veertien uur dertig");
    assert.equal(en("05/10/2026 14:30"), "the fifth of October at fourteen thirty");
    assert.equal(nl("ma 05/10 08:00–10:00"), "maandag vijf oktober van acht uur tot tien uur");
  });

  it("leaves things that only look like dates alone", () => {
    assert.equal(nl("32/13"), "tweeëndertig op dertien");
    assert.equal(nl("versie 1.2.3"), "versie 1.2.3");
  });
});

describe("times", () => {
  it("Dutch", () => {
    assert.equal(nl("om 14:30"), "om veertien uur dertig");
    assert.equal(nl("om 08:00"), "om acht uur");
    assert.equal(nl("om 08:05"), "om acht uur vijf");
    assert.equal(nl("om 01:00"), "om één uur");
    assert.equal(nl("om 00:00"), "om middernacht");
    assert.equal(nl("om 14:30 uur"), "om veertien uur dertig");
    assert.equal(nl("om 14u30"), "om veertien uur dertig");
    assert.equal(nl("om 9u"), "om negen uur");
    assert.equal(nl("om 9.30 uur"), "om negen uur dertig");
  });

  it("English", () => {
    assert.equal(en("at 14:30"), "at fourteen thirty");
    assert.equal(en("at 08:00"), "at eight o'clock");
    assert.equal(en("at 08:05"), "at eight oh five");
    assert.equal(en("at 14:00"), "at fourteen hundred");
    assert.equal(en("at 00:00"), "at midnight");
  });

  it("ranges", () => {
    assert.equal(nl("08:00–10:00"), "van acht uur tot tien uur");
    assert.equal(nl("van 08:00 - 10:00"), "van acht uur tot tien uur");
    assert.equal(nl("tussen 08:00–10:30"), "tussen acht uur en tien uur dertig");
    assert.equal(en("08:00–10:00"), "from eight to ten o'clock");
    assert.equal(en("13:00–15:30"), "from thirteen hundred to fifteen thirty");
    assert.equal(en("from 08:30-10:00"), "from eight thirty to ten o'clock");
  });
});

describe("numbers and units", () => {
  it("Dutch units", () => {
    assert.equal(nl("3,2 m"), "drie komma twee meter");
    assert.equal(nl("12 m²"), "twaalf vierkante meter");
    assert.equal(nl("12m2"), "twaalf vierkante meter");
    assert.equal(nl("21 °C"), "eenentwintig graden");
    assert.equal(nl("21°"), "eenentwintig graden");
    assert.equal(nl("1 °C"), "één graad");
    assert.equal(nl("-3 °C"), "min drie graden");
    assert.equal(nl("4,5 kWh"), "vier komma vijf kilowattuur");
    assert.equal(nl("3 kW"), "drie kilowatt");
    assert.equal(nl("12 km"), "twaalf kilometer");
    assert.equal(nl("50 km/h"), "vijftig kilometer per uur");
    assert.equal(nl("5 mm en 3 cm"), "vijf millimeter en drie centimeter");
    assert.equal(nl("15%"), "vijftien procent");
    assert.equal(nl("15,5 %"), "vijftien komma vijf procent");
    assert.equal(nl("10 min"), "tien minuten");
    assert.equal(nl("2 kg"), "twee kilo");
  });

  it("English units", () => {
    assert.equal(en("3,2 m"), "three point two metres");
    assert.equal(en("1 m"), "one metre");
    assert.equal(en("12 m²"), "twelve square metres");
    assert.equal(en("21 °C"), "twenty-one degrees");
    assert.equal(en("4,5 kWh"), "four point five kilowatt hours");
    assert.equal(en("50 km/h"), "fifty kilometres per hour");
    assert.equal(en("15%"), "fifteen percent");
  });

  it("dimensions and 'times'", () => {
    assert.equal(nl("3 x 2,8 m"), "drie op twee komma acht meter");
    assert.equal(nl("3 × 2,8 m"), "drie op twee komma acht meter");
    assert.equal(nl("3 m x 4 m"), "drie meter op vier meter");
    assert.equal(en("3 x 2,8 m"), "three by two point eight metres");
    assert.equal(nl("3x per week"), "drie keer per week");
    assert.equal(en("2x a day"), "two times a day");
  });

  it("plain numbers and decimals in running text", () => {
    assert.equal(nl("Je hebt 2 taken en 1 afspraak."), "Je hebt twee taken en één afspraak.");
    assert.equal(nl("Dat duurt 3,5 uur."), "Dat duurt drie komma vijf uur.");
    assert.equal(nl("0,5 liter"), "nul komma vijf liter");
    assert.equal(nl("3,05"), "drie komma nul vijf");
    assert.equal(nl("1.234.567 stappen"), "een miljoen tweehonderdvierendertigduizend vijfhonderdzevenenzestig stappen");
    assert.equal(en("It took 3.5 hours."), "It took three point five hours.");
    assert.equal(en("1,234 steps"), "one thousand two hundred thirty-four steps");
  });

  it("number ranges", () => {
    assert.equal(nl("2–3 dagen"), "twee tot drie dagen");
    assert.equal(nl("10-15%"), "tien tot vijftien procent");
    assert.equal(en("2-3 days"), "two to three days");
  });

  it("years after 'in' and month names", () => {
    assert.equal(nl("in 2027"), "in tweeduizend zevenentwintig");
    assert.equal(nl("sinds 1990"), "sinds negentienhonderdnegentig");
    assert.equal(en("in 2027"), "in twenty twenty-seven");
    assert.equal(en("October 2026"), "October twenty twenty-six");
    assert.equal(en("since 2000"), "since two thousand");
    assert.equal(en("2026 steps"), "two thousand twenty-six steps");
  });

  it("ordinals", () => {
    assert.equal(nl("de 1e, 2de, 3de, 8ste en 21ste"), "de eerste, tweede, derde, achtste en eenentwintigste");
    assert.equal(en("the 1st, 2nd, 3rd, 12th and 22nd"), "the first, second, third, twelfth and twenty-second");
  });

  it("leaves letters with digits alone", () => {
    assert.equal(nl("4G en mp3"), "4G en mp3");
  });
});

describe("codes", () => {
  it("IBAN digit by digit in groups, not one huge number", () => {
    assert.equal(nl("BE12 3456 7890 1234"), "B E één twee, drie vier vijf zes, zeven acht negen nul, één twee drie vier");
    assert.equal(en("BE12345678901234"), "B E one two, three four five six, seven eight nine zero, one two three four");
  });

  it("structured communication without the markers", () => {
    assert.equal(nl("Mededeling +++123/4567/89012+++."), "Mededeling één twee drie, vier vijf zes zeven, acht negen nul één twee.");
    assert.equal(nl("Mededeling ***123/4567/89012***"), "Mededeling één twee drie, vier vijf zes zeven, acht negen nul één twee");
    assert.equal(nl("Mededeling 123/4567/89012"), "Mededeling één twee drie, vier vijf zes zeven, acht negen nul één twee");
  });

  it("phone numbers and long reference numbers", () => {
    assert.equal(nl("Bel 0470 12 34 56."), "Bel nul vier zeven nul, één twee, drie vier, vijf zes.");
    assert.equal(nl("Bel +32 9 123 45 67"), "Bel plus drie twee, negen, één twee drie, vier vijf, zes zeven");
    assert.equal(en("Order 12345678"), "Order one two three, four five six, seven eight");
    assert.equal(nl("code 007"), "code nul nul zeven");
  });
});

describe("symbols, markdown and abbreviations", () => {
  it("symbols", () => {
    assert.equal(nl("Tom & Jerry"), "Tom en Jerry");
    assert.equal(en("Tom & Jerry"), "Tom and Jerry");
    assert.equal(nl("melk en/of brood, ja/nee"), "melk en of brood, ja of nee");
    assert.equal(en("yes/no"), "yes or no");
    assert.equal(nl("3 + 2"), "drie plus twee");
    assert.equal(nl("Disney+"), "Disney plus");
    assert.equal(nl("Keuken – woonkamer"), "Keuken, woonkamer");
    assert.equal(nl("24/7 bereikbaar"), "vierentwintig op zeven bereikbaar");
    assert.equal(en("24/7"), "twenty-four seven");
  });

  it("markdown, emoji and links", () => {
    assert.equal(nl("**Fluvius** `code` 🎉 ✅"), "Fluvius code");
    assert.equal(nl("# Overzicht\n- melk\n- brood"), "Overzicht. melk. brood.");
    assert.equal(nl("Zie [de kalender](/calendar)."), "Zie de kalender.");
    assert.equal(nl("Meer op https://example.com/page?x=1."), "Meer op de link.");
    assert.equal(en("See www.example.com for more"), "See the link for more");
    assert.equal(nl("Ticket #12"), "Ticket nummer twaalf");
  });

  it("Dutch abbreviations", () => {
    assert.equal(nl("Koop o.a. melk, bv. halfvol."), "Koop onder andere melk, bijvoorbeeld halfvol.");
    assert.equal(nl("Bv. melk"), "Bijvoorbeeld melk");
    assert.equal(nl("nr. 12"), "nummer twaalf");
    assert.equal(nl("ca. 3 m"), "ongeveer drie meter");
    assert.equal(nl("€ 10 incl. btw, € 8 excl. btw"), "tien euro inclusief btw, acht euro exclusief btw");
    assert.equal(nl("Fruit, groenten enz. Daarna de rest."), "Fruit, groenten enzovoort. Daarna de rest.");
    assert.equal(nl("Ma t/m vr"), "Ma tot en met vr");
  });

  it("English abbreviations", () => {
    assert.equal(en("We need e.g. bread, i.e. food, etc."), "We need for example bread, that is food, et cetera.");
    assert.equal(en("Call no. 5"), "Call number five");
    assert.equal(en("approx. 3 m"), "approximately three metres");
    assert.equal(en("Say no. Then go."), "Say no. Then go.");
  });
});

describe("robustness", () => {
  it("never throws and passes unknown text through", () => {
    assert.equal(nl(""), "");
    assert.equal(nl("Gewoon een zin zonder cijfers."), "Gewoon een zin zonder cijfers.");
    assert.equal(normalizeForSpeech(undefined as unknown as string, "nl", TODAY), "");
    assert.equal(normalizeForSpeech("op 05/10/2026", "nl", "not-a-date"), "op vijf oktober tweeduizend zesentwintig");
    assert.doesNotThrow(() => normalizeForSpeech("€€€ ///// ---- 00:00:00 99/99/9999 +++ *** ( ) [ ] 1,2,3,4 .,.,", "en", TODAY));
  });

  it("keeps every chunk within the server's limit after expanding", () => {
    const answer = Array.from({ length: 40 }, (_, index) => `Rekening ${index + 1}: € 1.234.567,89 op 05/10/2027`).join(", ") + ".";
    const chunks = speechChunks(answer, "nl", TODAY);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 600), chunks.map((chunk) => chunk.length).join(","));
    assert.ok(chunks.every((chunk) => !/\d/.test(chunk)));
  });
});
