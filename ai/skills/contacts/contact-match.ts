import { contactSubtitle, findTrade, tradeSynonyms, type Contact } from "@/features/contacts/types/contacts";
import { scoreCandidates, type EntityCandidate } from "@ai/core/resolve";
import { closeWords, words } from "@ai/core/text-match";

/**
 * How the assistant finds a contact by what people call them: "Jan", "Bouwbedrijf Peeters", "de aannemer",
 * "the contractor" (trades match in both languages), "de aannemer van de badkamer", "Jan de loodgieter".
 * Pure (no database), so the rules are unit-tested (contact-match.test.ts).
 */

/** Words that carry no meaning in a reference to a contact ("de aannemer van de badkamer" → aannemer badkamer). */
const STOP_WORDS = new Set(["de", "het", "een", "onze", "ons", "mijn", "van", "voor", "bij", "the", "a", "an", "our", "my", "of", "for", "at", "from", "die", "that"]);

/** The meaningful words of a reference, folded. */
export const searchWords = (query: string) => words(query).filter((word) => !STOP_WORDS.has(word));

/** What the `contact` resolver hands a tool in `data` (the contract other skills, e.g. mail, rely on). */
export type ContactRefData = {
  /** Primary email address (the first), or null when the contact has none. */
  email: string | null;
  emails: string[];
  /** Primary phone number (the first), or null. */
  phone: string | null;
  phones: string[];
  company: string | null;
  trade: string | null;
};

export const contactRefData = (contact: Contact): ContactRefData => ({
  email: contact.emails[0] ?? null,
  emails: contact.emails,
  phone: contact.phones[0] ?? null,
  phones: contact.phones,
  company: contact.company,
  trade: contact.trade,
});

const unique = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];

/** A contact as a resolver candidate: name, plus company, trade and project roles (in both languages) and "<trade> <project>" as aliases. */
export function contactCandidate(contact: Contact): EntityCandidate {
  const trades = tradeSynonyms(contact.trade);
  const roles = contact.projects.flatMap((project) => tradeSynonyms(project.role));
  const perProject = contact.projects.flatMap((project) => unique([...trades, ...tradeSynonyms(project.role)]).map((word) => `${word} ${project.name}`));
  return {
    id: contact.id,
    name: contact.name,
    aliases: unique([contact.company, ...trades, ...roles, ...perProject]),
    ...(contactSubtitle(contact) && { hint: contactSubtitle(contact) }),
    data: contactRefData(contact),
  };
}

/** Every word a contact can be called by. */
const wordsOf = (contact: Contact) =>
  new Set(
    [contact.name, contact.company ?? "", ...tradeSynonyms(contact.trade), ...contact.projects.flatMap((project) => [project.name, ...tradeSynonyms(project.role)])].flatMap(words),
  );

/** Does the contact work on a running (planned or active) project as this trade (its role there, or its own trade)? */
const onRunningProjectAs = (contact: Contact, trade: string) =>
  contact.projects.some((project) => project.running && (findTrade(project.role)?.key === trade || findTrade(contact.trade)?.key === trade));

/**
 * The candidates the matcher should choose from for a query. A clear match by name, company or alias goes to the
 * normal matcher. Otherwise every meaningful word must name the contact ("Jan de aannemer" → Jan, who is a
 * contractor); several left and the query names a trade → those doing it on a running (planned or active) project.
 * One or a few chosen this way get the query as an alias, so the matcher takes them (one) or asks "which one?"
 * (several). Nothing matching: every candidate, so the matcher says what is known.
 */
export function narrowContacts(query: string, contacts: Contact[]): EntityCandidate[] {
  const candidates = contacts.map(contactCandidate);
  const scored = scoreCandidates(query, candidates);
  const best = scored[0];
  if (best && (scored.filter((entry) => entry.score >= best.score - 5).length === 1 || scored.filter((entry) => entry.score >= 100).length === 1)) return candidates;

  const terms = searchWords(query);
  if (!terms.length) return candidates;
  let matches = contacts.filter((contact) => {
    const own = wordsOf(contact);
    return terms.every((term) => [...own].some((word) => closeWords(term, word)));
  });
  const trade = terms.map((term) => findTrade(term)?.key).find(Boolean);
  if (matches.length > 1 && trade) {
    const onRunning = matches.filter((contact) => onRunningProjectAs(contact, trade));
    if (onRunning.length >= 1) matches = onRunning;
  }
  if (!matches.length) return candidates;
  return matches.map((contact) => {
    const candidate = contactCandidate(contact);
    return { ...candidate, aliases: [...(candidate.aliases ?? []), query] };
  });
}
