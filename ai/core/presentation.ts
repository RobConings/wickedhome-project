/** Small mappers for feature-owned presentations. Never interpret model HTML or executable code. */
export const dataObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const dataRows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(dataObject) : [];
export const stringValue = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
