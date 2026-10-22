/**
 * The server voice chosen on this device, per language (localStorage; not remembered when storage is off), and
 * friendly names derived from voice ids such as `nl_BE-rdh-medium`.
 */
import { readStored, writeStored } from "@/lib/storage";

const voiceKey = (locale: "en" | "nl") => `wh-assistant-voice-${locale}`;

/** The voice picked on this device for `locale`, or `null` for the server's default. */
export const readVoicePreference = (locale: "en" | "nl"): string | null => readStored(voiceKey(locale)) || null;

export const writeVoicePreference = (locale: "en" | "nl", voice: string | null) => writeStored(voiceKey(locale), voice || null);

/** Voices whose id doesn't say they are male (Piper names). Everything else is read from the id. */
const MALE_VOICES = new Set(["rdh"]);
const GENDER_WORDS = new Set(["male", "female", "man", "woman"]);

export type VoiceLabelParts = {
  /** "Nathalie", "Northern English". */
  name: string;
  /** `nl_BE`, `en_GB`…, for "(Vlaams)" / "(British)"; `null` when the name already says it or the id doesn't. */
  region: string | null;
  male: boolean;
};

const titleCase = (words: string) => words.replace(/\b\p{Ll}/gu, (letter) => letter.toUpperCase());

/** `nl_BE-rdh-medium` → `{ name: "Rdh", region: "nl_BE", male: true }`. Ids of other servers keep their own name. */
export function voiceLabelParts(id: string): VoiceLabelParts {
  const match = /^([a-z]{2,3})[_-]([A-Za-z]{2})-(.+?)(?:-(?:x_low|low|medium|high))?$/.exec(id);
  if (!match) return { name: titleCase(id.replace(/[_-]+/g, " ").trim()) || id, region: null, male: false };
  const [, language = "", country = "", rawName = ""] = match;
  const words = rawName.split(/[_-]+/).filter(Boolean);
  const male = words.some((word) => word.toLowerCase() === "male" || word.toLowerCase() === "man") || MALE_VOICES.has(rawName.toLowerCase());
  const name = titleCase(words.filter((word) => !GENDER_WORDS.has(word.toLowerCase())).join(" ")) || id;
  const saysRegion = /\b(english|dutch|flemish|british|american|scottish|irish|welsh)\b/i.test(name);
  return { name, region: saysRegion ? null : `${language.toLowerCase()}_${country.toUpperCase()}`, male };
}
