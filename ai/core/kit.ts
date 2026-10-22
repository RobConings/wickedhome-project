/**
 * Everything a skill needs, in one import (`import { … } from "@ai/core/kit"`): registering skills, tools,
 * entity resolvers, search sources, snapshot lines and screen contexts, plus the helpers for arguments and
 * compact results. See ai/docs/ADDING-TOOLS.md.
 */
export { registerAssistantSkill, type AssistantSkillDefinition } from "./skills";
export {
  registerAssistantTool,
  type AssistantPreview,
  type AssistantToolContext,
  type AssistantToolDefinition,
  type RegisteredAssistantTool,
} from "./tools";
export { entityNames, entityRef, registerEntityResolver, type EntityCandidate, type EntityResolver, type EntityType, type ResolvedEntity } from "./resolve";
export { registerSearchSource, type SearchHit, type SearchSource } from "./search";
export { registerAssistantContext, type AssistantContextProvider } from "./context";
export { registerScreenContext, screenTarget, type ScreenContextDefinition, type ScreenDescription } from "./screen-context";
export { capList, day, done, lines, money, prune, round } from "./compact";
export { dateSchema, eurosSchema, monthSchema, optionalDateSchema, say, timeSchema, toCents, toEuros } from "./tool-helpers";
/** The app's own texts for an i18n key (`"integrations:jobs.google-mail.title"`), e.g. job and notification titles. */
export { appText } from "./app-map";
